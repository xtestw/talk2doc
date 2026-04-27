// LLM 层 · 注册表
// 加新 adapter（Anthropic Native、Mistral Native…）只需 import + push。

import { GeminiAdapter } from "./gemini";
import { OpenAIAdapter } from "./openai";
import type { LLMAdapter } from "./types";

export const ADAPTERS: LLMAdapter[] = [GeminiAdapter, OpenAIAdapter];

export function selectAdapter(id: string | undefined | null): LLMAdapter {
  const want = (id || "").trim().toLowerCase();
  if (want === "openai") return OpenAIAdapter; // 向后兼容旧参数
  return ADAPTERS.find((a) => a.id === want) ?? GeminiAdapter;
}

export type { LLMAdapter, StreamRequest } from "./types";
