// ASR 适配层 · 公共契约
// 任何 ASR provider（CF Whisper / OpenAI / Deepgram / 本地…）都实现这个接口。
//
// segments 形如 [{ start: 0.0, end: 5.32, text: "..." }, ...]
// 由桥接层统一格式化为带 [mm:ss] 的字幕文本，与 YouTube caption 输出对齐。

export interface AsrSegment {
  start: number;       // 秒
  end: number;         // 秒
  text: string;
}

export interface AsrResult {
  text: string;
  lang: string;        // 例 "auto" / "en" / "zh"
  durationSec: number; // 推断到的总时长；若 0 由调用方用元信息回填
  segments: AsrSegment[];
}

export interface AsrProvider {
  readonly id: string;
  transcribe(audio: Uint8Array, opts?: { lang?: string; signal?: AbortSignal }): Promise<AsrResult>;
}
