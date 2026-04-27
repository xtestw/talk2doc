// 大模型层 · 公共契约
// 任何 LLM adapter（当前：Gemini / DeepSeek）都实现这个接口。

import type { Frame } from "../transcript/types";

export interface StreamRequest {
  /** 系统提示词（角色与硬规则） */
  systemPrompt: string;
  /** 本次任务的具体输入（字幕 + 元信息 + 任务指令） */
  userPrompt: string;
  /** 关键帧 sprite 等图像。不支持 vision 的 endpoint 应自行忽略或报错。 */
  images: Frame[];
  /** 模型名，缺省走 adapter.defaultModel */
  model?: string;
  apiKey: string;
  /** 兼容 endpoint（主要用于 DeepSeek），Gemini 不消费此字段。 */
  baseUrl?: string;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface LLMAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly defaultModel: string;
  /**
   * 该 adapter + model 是否支持视觉输入。
   * 上层 agent 据此决定是否传 images，并相应调整 prompt 描述。
   * 缺省视为 true（多数原生 vision adapter 总是支持）。
   */
  supportsVision?(model?: string): boolean;
  /**
   * 流式生成：返回一条文本增量（已抽干上游协议的 chunk）。
   * 异常以 reject promise 抛出；流中途出错由 stream 内 cancel/error 处理。
   */
  stream(req: StreamRequest): Promise<ReadableStream<string>>;
}
