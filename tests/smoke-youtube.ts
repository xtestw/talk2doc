// 烟囱测试 · transcript 层
// 直接跑 YouTubeProvider.extract，确认能抽到字幕 + 故事板 sprite。
// 用法：npx tsx tests/smoke-youtube.ts [videoId]

import { YouTubeProvider } from "../src/infra/transcript/youtube";

const videoId = process.argv[2] ?? "xRh2sVcNXQ8";
const url = `https://www.youtube.com/watch?v=${videoId}`;

(async () => {
  console.log(`[smoke] url=${url}`);
  const t = await YouTubeProvider.extract(url);
  console.log("source:", t.source);
  console.log("title:", t.title);
  console.log("author:", t.author);
  console.log("duration:", `${Math.round(t.durationSec / 60)} min`);
  console.log("subtitleLang:", t.subtitleLang);
  console.log("subtitleLines:", t.subtitleLines);
  console.log("subtitle preview:");
  console.log(t.subtitle.split("\n").slice(0, 5).join("\n"));
  console.log("...");
  console.log(
    t.frames.length > 0
      ? `sprite: ${t.frames[0].mimeType}, base64 len=${t.frames[0].base64.length}`
      : "sprite: none",
  );
})();
