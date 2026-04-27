// Cloudflare Workers AI · Whisper 适配。
// 模型：@cf/openai/whisper-large-v3-turbo（CF 内置，按 neuron 计费）
//
// 注意：CF AI 的 Whisper 接收 audio 为 number[]（uint8 字节数组）。
// 长音频在 CF 平台上由 platform 自动分片，无需我们做切片。

import type { Ai } from "@cloudflare/workers-types";
import type { AsrProvider, AsrResult, AsrSegment } from "./types";

const DEFAULT_MODEL = "@cf/openai/whisper-large-v3-turbo";

interface WhisperOutput {
  text?: string;
  language?: string;
  word_count?: number;
  vtt?: string;
  words?: { word: string; start: number; end: number }[];
}

export interface CfWhisperOptions {
  ai: Ai;
  model?: string;
}

export function makeCfWhisper(opts: CfWhisperOptions): AsrProvider {
  const model = opts.model ?? DEFAULT_MODEL;
  return {
    id: "cf-whisper",
    async transcribe(audio): Promise<AsrResult> {
      const out = (await (opts.ai as unknown as {
        run: (model: string, input: { audio: number[] }) => Promise<WhisperOutput>;
      }).run(model, { audio: Array.from(audio) })) as WhisperOutput;

      const text = (out.text ?? "").trim();
      const words = out.words ?? [];
      const segments = groupWordsToSegments(words, 6);
      const durationSec = words.length > 0 ? words[words.length - 1].end : 0;

      return {
        text,
        lang: out.language || "auto",
        durationSec,
        segments,
      };
    },
  };
}

/** 把 word-level 时间戳按 ~maxSec 秒一段聚合，模拟句级 segments。 */
function groupWordsToSegments(
  words: { word: string; start: number; end: number }[],
  maxSec: number,
): AsrSegment[] {
  if (words.length === 0) return [];
  const out: AsrSegment[] = [];
  let cur: AsrSegment = { start: words[0].start, end: words[0].end, text: words[0].word };
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    if (w.end - cur.start >= maxSec) {
      out.push({ ...cur, text: cur.text.trim() });
      cur = { start: w.start, end: w.end, text: w.word };
    } else {
      cur.end = w.end;
      cur.text += w.word.startsWith(" ") ? w.word : ` ${w.word}`;
    }
  }
  out.push({ ...cur, text: cur.text.trim() });
  return out;
}
