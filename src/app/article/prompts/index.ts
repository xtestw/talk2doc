// Prompt 单一入口。
// 设计：
//   - 「稳定的指令文本」（system prompt + 风格样本）以 .md 维护，便于产品/编辑直接改文案。
//   - 「随数据动态拼装」的 user prompt 留在 ts，保持类型安全与组合自由度。

import fewShotMd from "../../../../prompts/few-shot.md";
import spokenMd from "../../../../prompts/article.spoken.md";
import publishMd from "../../../../prompts/article.publish.md";
import speakerIdMd from "../../../../prompts/speaker-id.system.md";
import { fill } from "../../../core/template";
import type { TranscriptResult } from "../../../infra/transcript/types";
import type { SpeakerManifest } from "../types";

export const FEW_SHOT = fewShotMd.trim();

export const SPOKEN_SYSTEM_PROMPT = fill(spokenMd, { FEW_SHOT });
export const PUBLISH_SYSTEM_PROMPT = fill(publishMd, { FEW_SHOT });
export const SPEAKER_ID_SYSTEM_PROMPT = speakerIdMd;

/** 阶段 2 · 正文撰写的 user prompt（带视频元信息 + 字幕 + 权威发言人名单）。 */
export function buildUserPrompt(t: TranscriptResult, manifest?: SpeakerManifest): string {
  const minutes = Math.round(t.durationSec / 60);

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
    t.subtitle,
    "",
    t.frames.length > 0
      ? "上方附图为均匀采样的 10×10 关键帧 sprite，按行优先顺序对应整段时间轴。"
      : "（无关键帧 sprite，仅基于字幕生成。）",
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

function clipSubtitleForSpeakerId(subtitle: string): string {
  const lines = subtitle.split("\n");
  if (lines.length <= 200) return subtitle;
  const head = lines.slice(0, 120);
  const tailStart = Math.max(head.length, lines.length - 60);
  const mid = lines.slice(Math.floor(lines.length / 2) - 10, Math.floor(lines.length / 2) + 10);
  const tail = lines.slice(tailStart);
  return [...head, "...", "（中段抽样）", ...mid, "...", ...tail].join("\n");
}
