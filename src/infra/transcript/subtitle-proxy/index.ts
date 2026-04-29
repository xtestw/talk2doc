import { SubtitleFetchTransientError, SubtitleUnavailableError } from "../errors";
import type { TranscriptProvider, TranscriptResult } from "../types";
import { YouTubeProvider } from "../youtube";

export function makeSubtitleProxyProvider(baseUrl: string): TranscriptProvider {
  const normalizedBase = String(baseUrl || "").trim().replace(/\/+$/, "");

  return {
    id: "subtitle-proxy",
    supports(input: string): boolean {
      return Boolean(normalizedBase) && YouTubeProvider.supports(input);
    },
    async extract(input: string, opts?: { signal?: AbortSignal }): Promise<TranscriptResult> {
      if (!normalizedBase) {
        throw new SubtitleFetchTransientError("subtitle-proxy 未配置");
      }
      const endpoint = `${normalizedBase}/api/transcript/youtube?url=${encodeURIComponent(input)}`;
      const resp = await fetch(endpoint, { method: "GET", signal: opts?.signal });
      if (!resp.ok) {
        throw new SubtitleFetchTransientError(`subtitle-proxy 失败：HTTP ${resp.status}`);
      }
      const json = (await resp.json()) as {
        source?: string;
        videoId?: string;
        title?: string;
        author?: string;
        durationSec?: number;
        subtitleLines?: number;
        subtitleLang?: string;
        ossUrl?: string;
      };
      if (!json.ossUrl || !json.subtitleLines) {
        throw new SubtitleUnavailableError("subtitle-proxy 未返回 OSS 字幕地址");
      }
      const subtitleResp = await fetch(String(json.ossUrl), { signal: opts?.signal });
      if (!subtitleResp.ok) {
        throw new SubtitleFetchTransientError(`拉取 OSS 字幕失败：HTTP ${subtitleResp.status}`);
      }
      const subtitle = await subtitleResp.text();
      if (!subtitle.trim()) throw new SubtitleUnavailableError("OSS 字幕内容为空");
      return {
        source: json.source || "youtube",
        videoId: String(json.videoId || ""),
        title: String(json.title || ""),
        author: String(json.author || ""),
        durationSec: Number(json.durationSec || 0),
        subtitle: subtitle.trimEnd(),
        subtitleLines: Number(json.subtitleLines || 0),
        subtitleLang: String(json.subtitleLang || ""),
        frames: [],
      };
    },
  };
}
