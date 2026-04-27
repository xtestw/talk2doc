// 字幕获取层 · 公共契约
// 任何 transcript provider（YouTube / Bilibili / Whisper / 上传字幕…）都实现这个接口。

export interface Frame {
  /** base64-encoded image bytes (no data: prefix) */
  base64: string;
  mimeType: string;
}

export interface TranscriptResult {
  source: string; // provider id：如 "youtube"
  videoId: string;
  title: string;
  author: string;
  durationSec: number;
  /** 带 [mm:ss] 时间戳前缀的纯文本，每行一条 */
  subtitle: string;
  subtitleLines: number;
  /** 形如 "zh-Hans" 或 "en(asr)" */
  subtitleLang: string;
  /** 0..N 张关键帧 sprite，给具备 vision 能力的 LLM 当辅助信号 */
  frames: Frame[];
}

export interface TranscriptProvider {
  readonly id: string;
  /** 是否能处理这条 URL（仅看 hostname/pathname，不发请求） */
  supports(url: string): boolean;
  /** 真正抽取：拉元信息、字幕、关键帧 */
  extract(url: string, opts?: { signal?: AbortSignal }): Promise<TranscriptResult>;
}
