// Prompt 单一入口。
// 设计：
//   - 「稳定的指令文本」（system prompt + 风格样本）以 .md 维护，便于产品/编辑直接改文案。
//   - 「随数据动态拼装」的 user prompt 留在 ts，保持类型安全与组合自由度。

import fewShotMd from "../../../../prompts/few-shot.md";
import publishMd from "../../../../prompts/article.publish.md";
import speakerIdMd from "../../../../prompts/speaker-id.system.md";
import chapterPlanMd from "../../../../prompts/chapter-plan.system.md";
import { fill } from "../../../core/utils/template";
import type { TranscriptResult } from "../../../infra/transcript/types";
import type { SpeakerManifest } from "../types";

export const FEW_SHOT = fewShotMd.trim();

export const PUBLISH_SYSTEM_PROMPT = fill(publishMd, { FEW_SHOT });
export const SPEAKER_ID_SYSTEM_PROMPT = speakerIdMd;
export const CHAPTER_PLAN_SYSTEM_PROMPT = chapterPlanMd.trim();

/** 阶段 2 · 正文撰写的 user prompt（带视频元信息 + 字幕 + 权威发言人名单）。 */
export function buildUserPrompt(
  t: TranscriptResult,
  manifest?: SpeakerManifest,
  opts?: { chapterPlan?: string },
): string {
  const minutes = Math.round(t.durationSec / 60);
  const cleaned = cleanSubtitleForWriting(t.subtitle);

  const roster = manifest && manifest.participants.length > 0
    ? [
        "## 参与者名单（权威，**对话块姓名必须从此处选择**）",
        ...manifest.participants.map(
          (p) => `- ${p.role}：**${p.name}** —— ${p.evidence || "（无说明）"}`,
        ),
        manifest.confidence === "low"
          ? `> 注：识别置信度=low（${manifest.notes || "字幕线索不足"}），可适度使用占位身份。`
          : `> 识别置信度=${manifest.confidence}${manifest.notes ? `；备注：${manifest.notes}` : ""}`,
        "",
      ]
    : [];

  return [
    "## 视频元信息",
    `- 标题：${t.title || "（缺失）"}`,
    `- 作者：${t.author || "（缺失）"}`,
    `- 时长：约 ${minutes} 分钟`,
    `- 字幕语言：${t.subtitleLang}`,
    "",
    ...roster,
    "## 字幕（按时间顺序）",
    "",
    cleaned,
    "",
    t.frames.length > 0
      ? "上方附图为均匀采样的 10×10 关键帧 sprite，按行优先顺序对应整段时间轴。"
      : "（无关键帧 sprite，仅基于字幕生成。）",
    "",
    ...(opts?.chapterPlan
      ? [
          "## 章节规划（写作时优先对齐）",
          opts.chapterPlan.trim(),
          "",
        ]
      : []),
    "写作时先保证事实还原，再做语言整理。不得引入字幕里没有的新事实。",
    "",
    "请严格按照当前系统提示词完成写作任务。",
  ].join("\n");
}

/** 阶段 1 · 角色识别的 user prompt（仅取首尾 + 中段抽样字幕，控制长度）。 */
export function buildSpeakerIdUserPrompt(t: TranscriptResult): string {
  const minutes = Math.round(t.durationSec / 60);
  const subtitle = clipSubtitleForSpeakerId(t.subtitle);
  return [
    "## 视频元信息",
    `- 标题：${t.title || "（缺失）"}`,
    `- 作者/频道：${t.author || "（缺失）"}`,
    `- 时长：约 ${minutes} 分钟`,
    `- 字幕语言：${t.subtitleLang}`,
    "",
    "## 字幕节选（按时间顺序，已截取首尾及中段以控制长度）",
    "",
    subtitle,
    "",
    t.frames.length > 0
      ? "上方附图为均匀采样的 10×10 关键帧 sprite，按行优先对应整段时间轴。请重点关注画面中的人脸数量、姓名牌、PPT 标题等视觉线索。"
      : "（本次无关键帧 sprite，请仅基于字幕与视频元信息判断。）",
    "",
    "请按系统指令输出严格 JSON。",
  ].join("\n");
}

/** 阶段 1.2 · 章节规划的 user prompt。 */
export function buildChapterPlanUserPrompt(t: TranscriptResult, manifest?: SpeakerManifest): string {
  const minutes = Math.round(t.durationSec / 60);
  const subtitle = clipSubtitleForRestorePlan(cleanSubtitleForWriting(t.subtitle));
  const names = manifest?.participants?.map((p) => `${p.role}:${p.name}`).join("；") || "（未提供）";
  return [
    "## 视频元信息",
    `- 标题：${t.title || "（缺失）"}`,
    `- 作者/频道：${t.author || "（缺失）"}`,
    `- 时长：约 ${minutes} 分钟`,
    `- 字幕语言：${t.subtitleLang}`,
    `- 参与者名单：${names}`,
    "",
    "## 清洗后字幕（节选，按时间顺序）",
    subtitle,
    "",
    "请输出“章节规划”，用于后续写作分块。",
  ].join("\n");
}

function clipSubtitleForSpeakerId(subtitle: string): string {
  const lines = subtitle.split("\n");
  if (lines.length <= 200) return subtitle;
  const head = lines.slice(0, 120);
  const tailStart = Math.max(head.length, lines.length - 60);
  const mid = lines.slice(Math.floor(lines.length / 2) - 10, Math.floor(lines.length / 2) + 10);
  const tail = lines.slice(tailStart);
  return [...head, "...", "（中段抽样）", ...mid, "...", ...tail].join("\n");
}

function clipSubtitleForRestorePlan(subtitle: string): string {
  const lines = subtitle.split("\n");
  // 均匀采样：将字幕分为 10 段，每段取 36 行，保证全局覆盖（最多 360 行）
  if (lines.length <= 360) return subtitle;
  const segments = 10;
  const perSegment = 36;
  const result: string[] = [];
  for (let i = 0; i < segments; i++) {
    const start = Math.floor((i / segments) * lines.length);
    const end = Math.min(start + perSegment, lines.length);
    if (i > 0) result.push(`...（${Math.floor(start / lines.length * 100)}% 处抽样）`);
    result.push(...lines.slice(start, end));
  }
  return result.join("\n");
}

/** 步骤 1：去时间轴 + 说话人粗分 + 连续碎句合并（跨视频通用轻量规则）。 */
function cleanSubtitleForWriting(subtitle: string): string {
  const raw = subtitle
    .split("\n")
    .map((ln) => ln.replace(/^\[[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?\]\s*/g, "").trim())
    .filter(Boolean);
  if (raw.length === 0) return subtitle;

  const out: string[] = [];
  let curSpeaker = "";
  let curText = "";

  const flush = () => {
    const text = curText.trim();
    if (!text) return;
    out.push(curSpeaker ? `${curSpeaker}: ${text}` : text);
    curText = "";
  };

  for (const ln of raw) {
    const m = ln.match(/^(?:>>\s*)?([A-Za-z][A-Za-z .'-]{0,32}):\s*(.*)$/);
    if (m) {
      const speaker = m[1].trim();
      const content = (m[2] || "").trim();
      if (speaker !== curSpeaker) {
        flush();
        curSpeaker = speaker;
      }
      curText = curText ? `${curText} ${content}` : content;
      continue;
    }
    curText = curText ? `${curText} ${ln}` : ln;
  }
  flush();

  return out.join("\n");
}
