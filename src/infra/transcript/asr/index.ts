// 把任意 AsrProvider 包装成 TranscriptProvider：
//   1. 用 InnerTube 拉视频元信息 + 选最低码率 audio 直链
//   2. fetch 音频字节
//   3. 调 asr.transcribe
//   4. 把 segments 格式化为与 YouTube caption 一致的 [mm:ss] 行
//
// 这是"YouTube 字幕缺失"时的兜底入口；扣分逻辑由 video-pipeline 用 withBilledStrategy 装饰。

import type { AsrProvider } from "../../asr/types";
import type { TranscriptProvider, TranscriptResult } from "../types";
import { extractVideoId } from "../youtube";
import {
  fetchPlayerResponse,
  pickLowestBitrateAudio,
} from "../youtube/innertube";

export interface AsrTranscriptOptions {
  asr: AsrProvider;
  /** 限定视频最大时长（秒）。超过抛错，避免无意中跑 1 小时 ASR。默认 30 分钟。 */
  maxDurationSec?: number;
  /** 限定下载音频最大字节，避免单 worker 内存炸。默认 32MB。 */
  maxAudioBytes?: number;
}

export function makeAsrTranscriptProvider(opts: AsrTranscriptOptions): TranscriptProvider {
  const maxDur = opts.maxDurationSec ?? 30 * 60;
  const maxBytes = opts.maxAudioBytes ?? 32 * 1024 * 1024;

  return {
    id: `asr:${opts.asr.id}`,

    supports(input: string): boolean {
      return extractVideoId(input) !== null;
    },

    async extract(input, ctx): Promise<TranscriptResult> {
      const videoId = extractVideoId(input);
      if (!videoId) throw new Error("不是合法的 YouTube 链接");

      const player = await fetchPlayerResponse(videoId, ctx?.signal);
      const status = player.playabilityStatus?.status;
      if (status && status !== "OK") {
        throw new Error(`视频不可播放：${player.playabilityStatus?.reason || status}`);
      }

      const lengthSec = parseInt(player.videoDetails?.lengthSeconds ?? "0", 10) || 0;
      if (lengthSec > maxDur) {
        throw new Error(`视频时长 ${Math.round(lengthSec / 60)} 分钟，超过 ASR 兜底上限 ${Math.round(maxDur / 60)} 分钟`);
      }

      const audio = pickLowestBitrateAudio(player);
      if (!audio?.url) throw new Error("拉不到可下载的音频流，ASR 兜底放弃");

      const audioResp = await fetch(audio.url, { signal: ctx?.signal });
      if (!audioResp.ok || !audioResp.body) {
        throw new Error(`下载音频失败：HTTP ${audioResp.status}`);
      }
      const audioBuf = await readBoundedBytes(audioResp.body, maxBytes);

      const result = await opts.asr.transcribe(audioBuf, { signal: ctx?.signal });
      const subtitleLines = result.segments.length || (result.text ? 1 : 0);
      const subtitle = result.segments.length > 0
        ? result.segments
            .map((s) => `[${formatTime(s.start * 1000)}] ${s.text.trim()}`)
            .filter((l) => l.length > 0)
            .join("\n")
        : result.text;

      if (!subtitle) throw new Error("ASR 返回空文本");

      return {
        source: "asr",
        videoId,
        title: player.videoDetails?.title ?? "",
        author: player.videoDetails?.author ?? "",
        durationSec: lengthSec || result.durationSec,
        subtitle,
        subtitleLines: Math.max(1, subtitleLines),
        subtitleLang: `${result.lang}(asr)`,
        frames: [],
      };
    },
  };
}

async function readBoundedBytes(body: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > max) throw new Error(`音频体积超过上限（${(max / 1024 / 1024).toFixed(0)}MB）`);
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
