// HMAC-SHA256 + base64url + 时序安全比较；JWT/HMAC-state/Stripe 验签共用。
// 全部基于 Web Crypto，零依赖。

const enc = new TextEncoder();

export async function hmacSha256(message: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return new Uint8Array(sig);
}

export async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const bytes = await hmacSha256(message, secret);
  return bytesToHex(bytes);
}

export function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}

export function b64urlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? enc.encode(input) : input;
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecodeToString(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/")
    + "===".slice(0, (4 - input.length % 4) % 4);
  return atob(padded);
}

/** 时序安全比较（避免按字符比较被定时攻击）。仅当长度一致才返回 true。 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
