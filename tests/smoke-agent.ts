// 端到端烟囱 · transcript → ArticleAgent → 字符流到 stdout
//
// 用法：
//   LLM_API_KEY=sk-... npx tsx tests/smoke-agent.ts                    (默认 DeepSeek + 默认视频)
//   LLM_API_KEY=sk-... npx tsx tests/smoke-agent.ts <youtubeUrl>
//
// 环境变量（皆可选）：
//   LLM_PROVIDER  默认 "deepseek"          ("gemini" | "deepseek")
//   LLM_BASE_URL  默认 "https://api.deepseek.com/v1"
//   LLM_MODEL     默认 "deepseek-chat"
//   OUT_FILE      若设置，则把正文 markdown 顺手落盘
//                 留空则默认落到 tests/.outputs/<videoId>-<provider>-<model>-<ts>.md

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ArticleAgent } from "../src/app/article/article-agent";
import { selectAdapter } from "../src/infra/llm";
import { YouTubeProvider, extractVideoId } from "../src/infra/transcript/youtube";

const url = process.argv[2] ?? "https://www.youtube.com/watch?v=xRh2sVcNXQ8";
const apiKey = process.env.LLM_API_KEY ?? "";
const providerId = process.env.LLM_PROVIDER ?? "deepseek";
const baseUrl = process.env.LLM_BASE_URL ?? "https://api.deepseek.com/v1";
const model = process.env.LLM_MODEL ?? "deepseek-chat";
const outFile = process.env.OUT_FILE ?? defaultOutFile();

function defaultOutFile(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const vid = extractVideoId(url) ?? "unknown";
  const safeModel = model.replace(/[^\w.-]+/g, "_");
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return resolve(here, ".outputs", `${vid}-${providerId}-${safeModel}-${ts}.md`);
}

if (!apiKey) {
  console.error("[smoke] 缺少 LLM_API_KEY 环境变量");
  process.exit(1);
}

const log = (m: string) => console.error(`\x1b[2m${m}\x1b[0m`);

(async () => {
  log(`[smoke] url=${url}`);
  log(`[smoke] llm provider=${providerId} model=${model} baseUrl=${baseUrl}`);

  log("[smoke] 抽取 transcript…");
  const transcript = await YouTubeProvider.extract(url);
  log(`[smoke] ${transcript.title} | ${transcript.author} | ${Math.round(transcript.durationSec / 60)}min`);
  log(`[smoke] 字幕 ${transcript.subtitleLines} 行（${transcript.subtitleLang}），sprite=${transcript.frames.length > 0 ? "yes" : "no"}`);

  const llm = selectAdapter(providerId);
  log(`[smoke] adapter=${llm.id} supportsVision=${llm.supportsVision?.(model) ?? true}`);
  log("[smoke] —— 开始流式生成 ——");

  const t0 = Date.now();
  let total = 0;
  let buf = "";

  for await (const ev of ArticleAgent.run({
    transcript,
    llm,
    apiKey,
    model,
    baseUrl,
  })) {
    if (ev.kind === "status") {
      log(`[status] ${ev.message}`);
    } else if (ev.kind === "chunk") {
      process.stdout.write(ev.text);
      buf += ev.text;
      total += ev.text.length;
    } else if (ev.kind === "error") {
      console.error(`\n\x1b[31m[error] ${ev.message}\x1b[0m`);
      process.exit(2);
    }
  }

  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  log(`\n[smoke] —— 完成 —— ${total} chars / ${sec}s`);

  if (outFile && buf) {
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, buf, "utf8");
    log(`[smoke] markdown 已落盘 → ${outFile}`);
  }
})().catch((e) => {
  console.error(`\n\x1b[31m[fatal] ${e instanceof Error ? e.stack : String(e)}\x1b[0m`);
  process.exit(1);
});
