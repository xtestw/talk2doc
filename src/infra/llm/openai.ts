// DeepSeek（OpenAI 兼容）· POST /chat/completions, stream:true
// 当前仅保留 DeepSeek 通道；协议仍按 OpenAI Chat Completions 兼容实现。
// vision 走 image_url + data URL；不支持 vision 的 endpoint 会自行忽略或报错（README 注明）。

import { sseEventSplitter } from "../../api/sse";
import type { LLMAdapter, StreamRequest } from "./types";

const DEFAULT_BASE = "https://api.deepseek.com/v1";
const DEFAULT_MODEL = "deepseek-chat";

// 已知不支持 vision 的模型前缀（按需扩展）。匹配上 → image_url 不送，prompt 也按纯字幕降级。
const TEXT_ONLY_MODEL_PREFIXES = [
  "deepseek-chat",
  "deepseek-reasoner",
  "deepseek-v3",
  "deepseek-r1",
  "moonshot-v1-8k",
  "moonshot-v1-32k",
  "moonshot-v1-128k", // 注意：moonshot-v1-*-vision-preview 不会命中
  "o1-mini",
  "gpt-3.5",
];

function isTextOnly(model?: string): boolean {
  if (!model) return false;
  const m = model.toLowerCase();
  return TEXT_ONLY_MODEL_PREFIXES.some((p) => m.startsWith(p));
}

interface OpenAIDelta {
  content?: string;
}

interface OpenAIChunk {
  choices?: { delta?: OpenAIDelta; finish_reason?: string | null }[];
  error?: { message?: string };
}

type Content =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export const OpenAIAdapter: LLMAdapter = {
  id: "deepseek",
  displayName: "DeepSeek",
  defaultModel: DEFAULT_MODEL,
  supportsVision: (model?: string) => !isTextOnly(model || DEFAULT_MODEL),

  async stream(req: StreamRequest): Promise<ReadableStream<string>> {
    const base = (req.baseUrl?.trim() || DEFAULT_BASE).replace(/\/+$/, "");
    const endpoint = `${base}/chat/completions`;
    const model = req.model || DEFAULT_MODEL;

    const userContent: Content[] = [{ type: "text", text: req.userPrompt }];
    for (const f of req.images) {
      userContent.push({
        type: "image_url",
        image_url: { url: `data:${f.mimeType};base64,${f.base64}` },
      });
    }

    const body = {
      model,
      stream: true,
      temperature: req.temperature ?? 0.6,
      max_tokens: req.maxOutputTokens ?? 8192,
      messages: [
        { role: "system", content: req.systemPrompt },
        { role: "user", content: userContent },
      ],
    };

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${req.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: req.signal,
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      throw new Error(`OpenAI API ${upstream.status}: ${detail || upstream.statusText}`);
    }

    return upstream.body
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(sseEventSplitter())
      .pipeThrough(openAITextExtractor());
  },
};

function openAITextExtractor(): TransformStream<string, string> {
  return new TransformStream({
    transform(event, ctrl) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        let json: OpenAIChunk;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }

        if (json.error?.message) {
          ctrl.error(new Error(json.error.message));
          return;
        }

        const text = json.choices?.[0]?.delta?.content ?? "";
        if (text) ctrl.enqueue(text);
      }
    },
  });
}
