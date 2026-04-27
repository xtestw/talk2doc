// 假 ASR provider：测试用；接口齐全、不真发请求。
// 真生产路径 cf-whisper，stub 仅在 smoke 测试和本地无 AI binding 时充当占位。

import type { AsrProvider, AsrResult } from "./types";

export function makeStubAsr(text = "(stub) 没有真实 ASR 结果"): AsrProvider {
  return {
    id: "stub",
    async transcribe(audio): Promise<AsrResult> {
      const seconds = Math.max(1, Math.floor(audio.byteLength / 16000));
      return {
        text,
        lang: "auto",
        durationSec: seconds,
        segments: [{ start: 0, end: seconds, text }],
      };
    },
  };
}
