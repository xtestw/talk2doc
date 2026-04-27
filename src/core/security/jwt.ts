// HS256 JWT，最小够用版。仅支持签发与验证 sub/email/exp/iat 等任意 claims。
// 不实现 RS256/ES256/JWE，避免把简单事情复杂化。

import { b64urlDecodeToString, b64urlEncode, hmacSha256, timingSafeEqual } from "./hmac";

export interface JwtClaims {
  sub: string;
  exp: number;
  iat: number;
  [k: string]: unknown;
}

const HEADER = b64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));

export async function signJwt(claims: JwtClaims, secret: string): Promise<string> {
  const payload = b64urlEncode(JSON.stringify(claims));
  const data = `${HEADER}.${payload}`;
  const sig = b64urlEncode(await hmacSha256(data, secret));
  return `${data}.${sig}`;
}

export async function verifyJwt<T extends JwtClaims = JwtClaims>(
  token: string,
  secret: string,
): Promise<T | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;

  // 先校验签名，再解析 payload（避免在未认证数据上进行昂贵解析）
  const expected = b64urlEncode(await hmacSha256(`${h}.${p}`, secret));
  if (!timingSafeEqual(expected, s)) return null;

  try {
    // 校验 header：防止 algorithm confusion 攻击
    const header = JSON.parse(b64urlDecodeToString(h)) as Record<string, unknown>;
    if (header.alg !== "HS256") return null;

    const claims = JSON.parse(b64urlDecodeToString(p)) as T;
    // sub 必须为非空字符串
    if (typeof claims.sub !== "string" || !claims.sub) return null;
    if (typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}
