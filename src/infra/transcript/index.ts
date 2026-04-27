// 字幕获取层 · 注册表
// 加新 provider 只需 import + push 到 PROVIDERS。

import type { TranscriptProvider } from "./types";
import { YouTubeProvider } from "./youtube";

export const PROVIDERS: TranscriptProvider[] = [
  YouTubeProvider,
  // 未来：BilibiliProvider, WhisperProvider, UploadedSrtProvider, ...
];

/** 按 url 选 provider；找不到返回 null。 */
export function selectProvider(url: string): TranscriptProvider | null {
  return PROVIDERS.find((p) => p.supports(url)) ?? null;
}

export type { TranscriptProvider, TranscriptResult, Frame } from "./types";
