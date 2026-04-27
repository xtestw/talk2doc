// Agent 层 · 公共契约
// Agent = "拿到 transcript，调 LLM，按业务语义产出结果"。
// 输出是一条事件流，由 api 层转译成 SSE 给浏览器。

import type { LLMAdapter, StreamRequest } from "../../infra/llm/types";
import type { TranscriptResult } from "../../infra/transcript/types";

/** 一名发言人的结构化档案，由角色识别阶段产出 */
export interface Participant {
  /** 流程内引用 id，如 "P1" */
  id: string;
  /** 真实姓名；推断不出时使用「主持人」「嘉宾」「联合主持」等占位身份 */
  name: string;
  /** 角色：主持人 / 嘉宾 / 联合主持 / 其他 */
  role: string;
  /** 1 句话说明判断依据，便于上层 status 事件呈报 */
  evidence: string;
}

export interface SpeakerManifest {
  participants: Participant[];
  confidence: "high" | "medium" | "low";
  notes: string;
  /** 是否使用了视觉信号（关键帧 sprite）辅助识别 */
  vision: boolean;
}

export type AgentEvent =
  | { kind: "status"; message: string }
  | { kind: "chunk"; text: string }
  | { kind: "error"; message: string };

export interface AgentInput {
  transcript: TranscriptResult;
  llm: LLMAdapter;
  /** LLM 配置透传 */
  apiKey: string;
  model?: string;
  baseUrl?: string;
  signal?: AbortSignal;
}

export interface Agent {
  readonly id: string;
  run(input: AgentInput): AsyncGenerator<AgentEvent, void, void>;
}

// 重导出，下游写 prompt builder 时少 import 一层
export type { LLMAdapter, StreamRequest, TranscriptResult };
