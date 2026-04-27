// YouTube 故事板 = 天然 sprite
// spec 形如：<URL_TEMPLATE>|L0_FIELDS|L1_FIELDS|...
// L0 是 10×10=100 帧的固定单张 sprite，已覆盖全片，无需拼图。
// L0 字段：width#height#count#cols#rows#interval#name#sigh
// 其中 name 用来替换 URL_TEMPLATE 里的 $N（L0 一般是 "default"，更高 level 是 "M$M"）。

import type { Frame } from "../types";
import { ANDROID_UA } from "./innertube";

export async function tryFetchStoryboardLevel0(
  spec: string | undefined,
  signal?: AbortSignal,
): Promise<Frame | null> {
  if (!spec) return null;
  const parts = spec.split("|");
  if (parts.length < 2) return null;
  const fields = parts[1].split("#"); // L0
  if (fields.length < 8) return null;
  const name = fields[6] || "default";
  const sigh = fields[7];
  if (!sigh || !sigh.startsWith("rs$")) return null;

  const url = parts[0].replace("$L", "0").replace("$N", name) + "&sigh=" + sigh;
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": ANDROID_UA, Accept: "image/jpeg,image/webp,image/*;q=0.8" },
      signal,
    });
    if (!resp.ok) return null;
    const buf = new Uint8Array(await resp.arrayBuffer());
    if (buf.byteLength < 256) return null;
    return {
      base64: bytesToBase64(buf),
      mimeType: resp.headers.get("Content-Type") || "image/jpeg",
    };
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}
