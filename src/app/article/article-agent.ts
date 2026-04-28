// ArticleAgent · 项目核心
// 两阶段流程：
//   1. 角色识别：从字幕（+ 可选关键帧 sprite）推断参与者真实姓名 → SpeakerManifest
//   2. 正文撰写：把 manifest 当作权威发言人标签注入 prompt，流式生成文章正文
// 仅产出 AgentEvent 事件，不关心 SSE/HTTP，由上层 api 层翻译为网络协议。

import type { Agent, AgentEvent, AgentInput, SpeakerManifest } from "./types";
import {
  CHAPTER_PLAN_SYSTEM_PROMPT,
  PUBLISH_SYSTEM_PROMPT,
  buildChapterPlanUserPrompt,
  buildUserPrompt,
} from "./prompts";
import { identifySpeakers } from "./speaker-id";
import { drainText } from "../../core/utils/stream";

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

    // ============ 阶段 2：内容聚类与章节规划 ============
    let chapterPlan = "";
    try {
      yield { kind: "status", message: "正在做话题聚类并生成章节规划…" };
      const chapterPlanStream = await llm.stream({
        systemPrompt: CHAPTER_PLAN_SYSTEM_PROMPT,
        userPrompt: buildChapterPlanUserPrompt(effective, manifest),
        images: effective.frames,
        apiKey: input.apiKey,
        model: input.model,
        baseUrl: input.baseUrl,
        signal: input.signal,
      });
      chapterPlan = (await drainText(chapterPlanStream)).trim();
      if (chapterPlan) {
        yield { kind: "status", message: "章节规划完成，将用于后续逐章重构" };
      }
    } catch {
      chapterPlan = "";
    }

    // ============ 阶段 3：正文生成（流式） ============
    const userPrompt = buildUserPrompt(effective, manifest, { chapterPlan });
    yield { kind: "status", message: `${llm.displayName} 正在生成正文…` };
    let article = "";
    try {
      article = await collectOne({
        input,
        llm,
        systemPrompt: PUBLISH_SYSTEM_PROMPT,
        userPrompt,
        images: effective.frames,
      });
    } catch (e) {
      yield { kind: "error", message: e instanceof Error ? e.message : String(e) };
      return;
    }

    const violations = checkQAOutline(article);
    if (violations.length > 0) {
      yield {
        kind: "status",
        message: `检测到结构问题（${violations.join("；")}），正在自动修复为标准问答结构…`,
      };
      try {
        article = await collectOne({
          input,
          llm,
          systemPrompt: PUBLISH_SYSTEM_PROMPT,
          userPrompt: buildRepairPrompt(userPrompt, article, violations),
          images: effective.frames,
        });
      } catch (e) {
        yield {
          kind: "status",
          message: `自动修复失败（${e instanceof Error ? e.message : String(e)}），将返回首版结果`,
        };
      }
    }

    yield { kind: "chunk", text: article };
  },
};

function checkQAOutline(text: string): string[] {
  const issues: string[] = [];
  const mainCount = (text.match(/^##\s+/gm) || []).length;
  const topicCount = (text.match(/^###\s+/gm) || []).length;
  const hostCount = (text.match(/^\*\*[^*\n]{1,24}\*\*:\s*.*[?？]\s*$/gm) || []).length;
  const answerCount = (text.match(/^\*\*[^*\n]{1,24}\*\*:\s*\S+/gm) || []).length;
  const variantMarkers = (text.match(/^#\s*(?:[ABＣＤ]版|[A-D]版|版本[一二三四ABCD])\b/gm) || []).length;

  if (variantMarkers > 0) issues.push("包含多版本标题");
  if (mainCount === 0) issues.push("缺少二级主题");
  if (topicCount === 0) issues.push("缺少三级小话题");
  if (hostCount === 0) issues.push("缺少问句型主持人提问");
  // 粗粒度：回答标签总数应该不少于主持人提问数。
  if (answerCount < Math.max(1, hostCount)) issues.push("回答段数量不足");
  return issues;
}

function buildRepairPrompt(originalUserPrompt: string, firstDraft: string, violations: string[]): string {
  return [
    originalUserPrompt,
    "",
    "## 修复任务（必须执行）",
    `首版输出存在以下问题：${violations.join("；")}`,
    "请在不引入新事实的前提下，仅做结构性修复，输出单一最终 Markdown 成稿：",
    "- 保留主题与关键信息，不要重写成不同文章。",
    "- 每个 ### 小话题都必须包含：1 条主持人提问（问句）+ 至少 1 条嘉宾回答。",
    "- 禁止输出 A/B 版、多草稿或解释说明。",
    "",
    "## 首版输出（待修复）",
    firstDraft.trim(),
  ].join("\n");
}

async function collectOne(opts: {
  input: AgentInput;
  llm: AgentInput["llm"];
  systemPrompt: string;
  userPrompt: string;
  images: AgentInput["transcript"]["frames"];
}): Promise<string> {
  const stream = await opts.llm.stream({
    systemPrompt: opts.systemPrompt,
    userPrompt: opts.userPrompt,
    images: opts.images,
    apiKey: opts.input.apiKey,
    model: opts.input.model,
    baseUrl: opts.input.baseUrl,
    signal: opts.input.signal,
  });
  return (await drainText(stream)).trim();
}
