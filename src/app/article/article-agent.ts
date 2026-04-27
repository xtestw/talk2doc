// ArticleAgent · 项目核心
// 两阶段流程：
//   1. 角色识别：从字幕（+ 可选关键帧 sprite）推断参与者真实姓名 → SpeakerManifest
//   2. 正文撰写：把 manifest 当作权威发言人标签注入 prompt，流式生成杂志体长文
// 仅产出 AgentEvent 事件，不关心 SSE/HTTP，由上层 api 层翻译为网络协议。

import type { Agent, AgentEvent, AgentInput, SpeakerManifest } from "./types";
import {
  PUBLISH_SYSTEM_PROMPT,
  SPOKEN_SYSTEM_PROMPT,
  buildUserPrompt,
} from "./prompts";
import { identifySpeakers } from "./speaker-id";

export const ArticleAgent: Agent = {
  id: "article",

  async *run(input: AgentInput): AsyncGenerator<AgentEvent, void, void> {
    const { transcript, llm } = input;

    // —— 视觉能力探测 ——
    // 纯文本模型（DeepSeek-V3 / Moonshot 文本版 / o1-mini …）不传 sprite，prompt 也同步切到纯字幕语境
    const visionOK = llm.supportsVision?.(input.model) ?? true;
    const effective = visionOK ? transcript : { ...transcript, frames: [] };
    if (!visionOK && transcript.frames.length > 0) {
      yield {
        kind: "status",
        message: `${llm.displayName}（${input.model || llm.defaultModel}）不支持视觉，已退化为纯字幕模式`,
      };
    }

    // ============ 阶段 1：角色识别 ============
    yield { kind: "status", message: "正在识别参与者…" };
    let manifest: SpeakerManifest;
    try {
      manifest = await identifySpeakers({
        transcript,
        llm,
        apiKey: input.apiKey,
        model: input.model,
        baseUrl: input.baseUrl,
        signal: input.signal,
      });
    } catch (e) {
      // 角色识别失败不阻塞主流程：退化为占位身份继续写稿
      yield {
        kind: "status",
        message: `角色识别失败（${e instanceof Error ? e.message : String(e)}），将以占位身份撰写`,
      };
      manifest = {
        participants: [
          { id: "P1", name: "主持人", role: "主持人", evidence: "（识别异常的兜底身份）" },
          { id: "P2", name: "嘉宾", role: "嘉宾", evidence: "（识别异常的兜底身份）" },
        ],
        confidence: "low",
        notes: "speaker-id 调用异常",
        vision: visionOK,
      };
    }

    yield {
      kind: "status",
      message: `识别到 ${manifest.participants.length} 位参与者：` +
        manifest.participants.map((p) => `${p.role} ${p.name}`).join("、") +
        `（置信度 ${manifest.confidence}${manifest.vision ? "·含视觉" : "·纯字幕"}）`,
    };

    // ============ 阶段 2：双版本正文（流式） ============
    yield { kind: "status", message: `${llm.displayName} 正在生成 A版（原始口播感）…` };
    yield { kind: "chunk", text: "# A版｜原始口播感\n\n" };
    const userPrompt = buildUserPrompt(effective, manifest);
    const aErr = yield* streamOne({
      input,
      llm,
      systemPrompt: SPOKEN_SYSTEM_PROMPT,
      userPrompt,
      images: effective.frames,
    });
    if (aErr) {
      yield { kind: "error", message: aErr };
      return;
    }

    yield { kind: "status", message: `${llm.displayName} 正在生成 B版（可发布文章）…` };
    yield { kind: "chunk", text: "\n\n---\n\n# B版｜可发布文章\n\n" };
    const bErr = yield* streamOne({
      input,
      llm,
      systemPrompt: PUBLISH_SYSTEM_PROMPT,
      userPrompt,
      images: effective.frames,
    });
    if (bErr) {
      yield { kind: "error", message: bErr };
      return;
    }
  },
};

async function* streamOne(opts: {
  input: AgentInput;
  llm: AgentInput["llm"];
  systemPrompt: string;
  userPrompt: string;
  images: AgentInput["transcript"]["frames"];
}): AsyncGenerator<AgentEvent, string | null, void> {
  let stream: ReadableStream<string>;
  try {
    stream = await opts.llm.stream({
      systemPrompt: opts.systemPrompt,
      userPrompt: opts.userPrompt,
      images: opts.images,
      apiKey: opts.input.apiKey,
      model: opts.input.model,
      baseUrl: opts.input.baseUrl,
      signal: opts.input.signal,
    });
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }

  const reader = stream.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return null;
      if (value) yield { kind: "chunk", text: value };
    }
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  } finally {
    reader.releaseLock();
  }
}
