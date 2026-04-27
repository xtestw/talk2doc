// 阶段 1 · 参与者识别（A/B/C 策略链）
// A: LLM + 字幕 + 关键帧（若支持 vision）
// B: LLM + 字幕（禁用视觉，规避 vision endpoint 兼容问题）
// C: 启发式规则（标题/字幕关键词）兜底
//
// 通过 core/execution/fallback 统一封装，避免 if/else 级联膨胀。

import type { LLMAdapter } from "../../infra/llm/types";
import type { TranscriptResult } from "../../infra/transcript/types";
import { SPEAKER_ID_SYSTEM_PROMPT, buildSpeakerIdUserPrompt } from "./prompts";
import type { Participant, SpeakerManifest } from "./types";
import { extractFirstJsonObject } from "../../core/utils/json";
import { runWithFallback, type FallbackStrategy } from "../../core/execution/fallback";
import { drainText } from "../../core/utils/stream";

export interface IdentifyOptions {
  transcript: TranscriptResult;
  llm: LLMAdapter;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  signal?: AbortSignal;
}

export async function identifySpeakers(opts: IdentifyOptions): Promise<SpeakerManifest> {
  const visionOK = opts.llm.supportsVision?.(opts.model) ?? true;
  const ctx = { ...opts, visionOK };
  const strategies: Array<FallbackStrategy<typeof ctx, SpeakerManifest>> = [
    {
      id: "llm-vision-or-full",
      run: async (c) => {
        const images = c.visionOK ? c.transcript.frames : [];
        return await callLlmStrategy(c, { images, vision: images.length > 0 });
      },
    },
    {
      id: "llm-text-only",
      run: async (c) => {
        // 主动禁用视觉，避免部分 OpenAI 兼容端对 image_url 的兼容噪音。
        return await callLlmStrategy(c, { images: [], vision: false });
      },
    },
    {
      id: "heuristic-title-subtitle",
      run: async (c) => heuristicManifest(c.transcript),
    },
  ];

  const { result, tried, errors } = await runWithFallback(ctx, strategies, {
    // low 也可接受（比硬失败更好），但要求至少有 1 名参与者
    accept: (m) => m.participants.length > 0,
  });

  if (result) {
    return {
      ...result,
      notes: joinNotes(result.notes, `strategy=${tried[tried.length - 1]}`),
    };
  }
  return defaultFallbackManifest(visionOK, {
    reason: "all_strategies_failed",
    detail: `tried=${tried.join(",")} errors=${errors.join(" | ")}`,
  });
}

/**
 * LLM 偶尔会包 ```json``` 或前置寒暄。提取首个 `{...}` 块再 JSON.parse。
 * 解析失败一律返回兜底 manifest——不让"识别失败"阻塞写稿主流程。
 */
function parseManifest(raw: string, vision: boolean): SpeakerManifest | null {
  const json = extractFirstJsonObject(raw);
  if (!json) return null;

  try {
    const obj = JSON.parse(json) as Partial<SpeakerManifest>;
    const participants = Array.isArray(obj.participants)
      ? obj.participants.filter(isParticipant).slice(0, 6)
      : [];
    if (participants.length === 0) return null;
    const confidence: SpeakerManifest["confidence"] =
      obj.confidence === "high" || obj.confidence === "medium" || obj.confidence === "low"
        ? obj.confidence
        : "medium";
    return {
      participants: participants.map((p, i) => ({
        id: p.id || `P${i + 1}`,
        name: (p.name || "嘉宾").trim(),
        role: (p.role || "嘉宾").trim(),
        evidence: (p.evidence || "").trim(),
      })),
      confidence,
      notes: typeof obj.notes === "string" ? obj.notes : "",
      vision,
    };
  } catch {
    return null;
  }
}

function isParticipant(x: unknown): x is Participant {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.name === "string" && typeof o.role === "string";
}

async function callLlmStrategy(
  opts: IdentifyOptions & { visionOK?: boolean },
  inOpt: { images: TranscriptResult["frames"]; vision: boolean },
): Promise<SpeakerManifest | null> {
  const t = { ...opts.transcript, frames: inOpt.images };
  const stream = await opts.llm.stream({
    systemPrompt: SPEAKER_ID_SYSTEM_PROMPT,
    userPrompt: buildSpeakerIdUserPrompt(t),
    images: inOpt.images,
    apiKey: opts.apiKey,
    model: opts.model,
    baseUrl: opts.baseUrl,
    signal: opts.signal,
    temperature: 0.1,
    maxOutputTokens: 1024,
  });
  const raw = await drainText(stream);
  return parseManifest(raw, inOpt.vision);
}

function heuristicManifest(t: TranscriptResult): SpeakerManifest {
  const participants: Participant[] = [];
  const title = t.title || "";
  const lowerTitle = title.toLowerCase();
  const subtitleHead = t.subtitle.slice(0, 4000).toLowerCase();

  const guest =
    capture(title, /^(.*?)(?:'s|：)/) ||
    capture(title, /with\s+([A-Z][\w.-]+(?:\s+[A-Z][\w.-]+){0,2})/i);
  if (guest) {
    participants.push({
      id: "P1",
      name: guest.trim(),
      role: "嘉宾",
      evidence: "标题中的 possessive/with 结构提示该嘉宾姓名",
    });
  } else if (lowerTitle.includes("interview") || lowerTitle.includes("outlook")) {
    participants.push({
      id: "P1",
      name: "嘉宾",
      role: "嘉宾",
      evidence: "标题表现为访谈语境，但无法稳定抽取姓名",
    });
  }

  // 尝试从字幕首段提取最常出现的称呼性英文名（首字母大写、长度 2-20 的单词，
  // 排除常见冠词、代词等噪声词）作为主持人姓名线索。
  const hostName = extractFrequentProperName(subtitleHead) ?? "主持人";
  participants.push({
    id: `P${participants.length + 1}`,
    name: hostName,
    role: "主持人",
    evidence: hostName === "主持人" ? "字幕未出现稳定主持人姓名线索" : `字幕中高频出现 ${hostName} 称呼线索`,
  });

  return {
    participants: participants.slice(0, 6),
    confidence: guest ? "medium" : "low",
    notes: "strategy=heuristic-title-subtitle",
    vision: false,
  };
}

function capture(s: string, re: RegExp): string | null {
  const m = s.match(re);
  return m?.[1]?.trim() || null;
}

/**
 * 从字幕文本中统计高频专有名词（英文大写开头单词）作为主持人姓名候选。
 * 排除常见冠词/代词/助词等噪声，取出现次数最多且 ≥ 3 次的词。
 */
function extractFrequentProperName(text: string): string | null {
  const NOISE = new Set([
    "the", "a", "an", "i", "you", "he", "she", "we", "they", "it",
    "and", "but", "or", "so", "in", "on", "at", "to", "for", "of",
    "this", "that", "is", "are", "was", "were", "be", "been",
    "have", "has", "had", "do", "did", "will", "would", "could",
    "yeah", "yes", "no", "well", "right", "okay", "ok", "like",
  ]);
  const counts = new Map<string, number>();
  for (const w of text.matchAll(/\b([A-Z][a-z]{1,19})\b/g)) {
    const word = w[1];
    if (!NOISE.has(word.toLowerCase())) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  const [top] = [...counts.entries()]
    .filter(([, n]) => n >= 3)
    .sort(([, a], [, b]) => b - a);
  return top?.[0] ?? null;
}

function defaultFallbackManifest(
  vision: boolean,
  detail: { reason: string; detail?: string },
): SpeakerManifest {
  return {
    participants: [
      { id: "P1", name: "主持人", role: "主持人", evidence: "（识别失败的兜底身份）" },
      { id: "P2", name: "嘉宾", role: "嘉宾", evidence: "（识别失败的兜底身份）" },
    ],
    confidence: "low",
    notes: `speaker-id fallback: ${detail.reason}${detail.detail ? `; ${detail.detail}` : ""}`,
    vision,
  };
}

function joinNotes(a: string, b: string): string {
  if (!a) return b;
  return `${a}; ${b}`;
}
