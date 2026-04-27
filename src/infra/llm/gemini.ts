// Gemini AI Studio · streamGenerateContent?alt=sse
// 输出统一为 ReadableStream<string>（已抽干 SSE/JSON），由调用方决定怎么转发。

import { sseEventSplitter } from "../../api/sse";
import type { LLMAdapter, StreamRequest } from "./types";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_RETRIES_ON_503 = 2;
const RETRY_BASE_MS = 700;

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiChunk {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  error?: { message?: string };
  promptFeedback?: { blockReason?: string };
}

export const GeminiAdapter: LLMAdapter = {
  id: "gemini",
  displayName: "Gemini AI Studio",
  defaultModel: DEFAULT_MODEL,
  supportsVision: () => true,

  async stream(req: StreamRequest): Promise<ReadableStream<string>> {
    const model = req.model || DEFAULT_MODEL;
    const endpoint = `${API_BASE}/${model}:streamGenerateContent?alt=sse`;

    // 将系统提示与用户内容分离：system_instruction 使模型明确角色边界，
    // 避免将规则文本混入 user turn 导致指令漂移。
    const userParts: GeminiPart[] = [{ text: req.userPrompt }];
    for (const f of req.images) {
      userParts.push({ inlineData: { mimeType: f.mimeType, data: f.base64 } });
    }

    const body: Record<string, unknown> = {
      ...(req.systemPrompt && {
        system_instruction: { parts: [{ text: req.systemPrompt }] },
      }),
      contents: [{ role: "user", parts: userParts }],
      generationConfig: {
        temperature: req.temperature ?? 0.6,
        topP: 0.95,
        maxOutputTokens: req.maxOutputTokens ?? 8192,
        responseMimeType: "text/plain",
      },
    };

    const requestInit: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": req.apiKey,
      },
      body: JSON.stringify(body),
      signal: req.signal,
    };
    const upstream = await fetchWith503Retry(endpoint, requestInit, req.signal);

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      if (upstream.status === 503) {
        throw new Error("Gemini 当前请求高峰，已自动重试仍失败，请稍后重试或切换 DeepSeek。");
      }
      throw new Error(`Gemini API ${upstream.status}: ${detail || upstream.statusText}`);
    }

    return upstream.body
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(sseEventSplitter())
      .pipeThrough(geminiTextExtractor());
  },
};

async function fetchWith503Retry(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  let attempt = 0;
  let lastResponse: Response | null = null;

  while (attempt <= MAX_RETRIES_ON_503) {
    const response = await fetch(url, init);
    if (response.status !== 503) return response;
    lastResponse = response;

    if (attempt === MAX_RETRIES_ON_503) break;
    const waitMs = RETRY_BASE_MS * (attempt + 1);
    await sleep(waitMs, signal);
    attempt += 1;
  }

  return lastResponse as Response;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** 把 Gemini SSE 事件解码为纯文本增量；遇到上游 error/blockReason 抛出。 */
function geminiTextExtractor(): TransformStream<string, string> {
  return new TransformStream({
    transform(event, ctrl) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        let json: GeminiChunk;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }

        if (json.error?.message) {
          ctrl.error(new Error(json.error.message));
          return;
        }
        if (json.promptFeedback?.blockReason) {
          ctrl.error(new Error(`内容被拦截：${json.promptFeedback.blockReason}`));
          return;
        }

        const parts = json.candidates?.[0]?.content?.parts ?? [];
        const text = parts.map((p) => p.text ?? "").join("");
        if (text) ctrl.enqueue(text);
      }
    },
  });
}
