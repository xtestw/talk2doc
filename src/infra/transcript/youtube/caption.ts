// caption.baseUrl + &fmt=json3：拿到的事件天然按句切分（不带字符级动画）

import { ANDROID_UA, type CaptionTrack } from "./innertube";

interface Json3Event {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: { utf8?: string }[];
}

export async function fetchCaptionJson3(
  track: CaptionTrack,
  signal?: AbortSignal,
): Promise<{ text: string; lines: number }> {
  // ANDROID 给的 baseUrl 默认是 srv3 XML，强制 json3 可绕过字符级动画
  const url = track.baseUrl.replace(/[&?]fmt=[^&]*/g, "") + "&fmt=json3";
  const resp = await fetch(url, { headers: { "User-Agent": ANDROID_UA }, signal });
  if (!resp.ok) throw new Error(`抓取字幕失败：HTTP ${resp.status}`);
  const json = (await resp.json()) as { events?: Json3Event[] };

  const out: string[] = [];
  for (const ev of json.events ?? []) {
    if (!ev.segs) continue;
    const txt = ev.segs
      .map((s) => s.utf8 ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!txt) continue;
    out.push(`[${formatTime(ev.tStartMs ?? 0)}] ${txt}`);
  }
  if (out.length === 0) throw new Error("字幕为空");
  return { text: out.join("\n"), lines: out.length };
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
