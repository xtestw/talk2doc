// ASR 注册表（按需扩展，例如 OpenAI Whisper / Deepgram / 阿里云 ASR）。
// 当前仅有 cf-whisper（生产）+ stub（测试）。

export type { AsrProvider, AsrResult, AsrSegment } from "./types";
export { makeCfWhisper } from "./cf-whisper";
export { makeStubAsr } from "./stub";
