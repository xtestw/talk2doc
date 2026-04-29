const TARGET_URL = "https://www.youtube.com/watch?v=xRh2sVcNXQ8&t=1144s";
const BASE = process.env.SUBTITLE_PROXY_BASE_URL || "http://127.0.0.1:3100";

async function main() {
  const resp = await fetch(`${BASE}/api/transcript/youtube`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: TARGET_URL }),
  });

  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`invalid json response: ${text.slice(0, 300)}`);
  }

  if (!resp.ok) {
    throw new Error(`request failed: HTTP ${resp.status} ${JSON.stringify(data)}`);
  }

  const lines = Number(data.subtitleLines || 0);
  const ossUrl = String(data.ossUrl || "");
  if (!lines || !ossUrl.trim()) {
    throw new Error(`invalid subtitle response: subtitleLines=${data.subtitleLines}, ossUrl=${ossUrl}`);
  }

  console.log("[smoke] ok");
  console.log(`[smoke] videoId=${data.videoId}`);
  console.log(`[smoke] subtitleLines=${data.subtitleLines}`);
  console.log(`[smoke] subtitleLang=${data.subtitleLang}`);
  console.log(`[smoke] ossUrl=${ossUrl}`);
  console.log(`[smoke] title=${String(data.title || "").slice(0, 120)}`);
}

main().catch((err) => {
  console.error("[smoke] fail:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
