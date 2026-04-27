// Session = HS256 JWT in HttpOnly cookie。
// 这个文件只关心"如何把用户身份编码到 cookie / 从 cookie 解出来"，不关心具体路由。

import { parseCookies, serializeCookie } from "../../core/security/cookie";
import { signJwt, verifyJwt, type JwtClaims } from "../../core/security/jwt";

/** 30 天 session（可后续做 refresh，本期保持简单）。 */
const SESSION_TTL_SEC = 30 * 24 * 60 * 60;

export const OAUTH_STATE_COOKIE = "t2d_oauth_state";

/**
 * 生产 HTTPS 环境使用 `__Host-` 前缀：浏览器强制 Secure + Path=/ + 禁 Domain 属性，
 * 防止子域 cookie 注入攻击。本地 HTTP 开发时回退为普通名称（`__Host-` 要求 Secure）。
 */
function sessionCookieName(secure: boolean): string {
  return secure ? "__Host-t2d_session" : "t2d_session";
}

export interface SessionPayload extends JwtClaims {
  email: string;
}

export async function issueSessionCookie(opts: {
  userId: string;
  email: string;
  secret: string;
  /** 用于 secure 标志；本地 http 也想要可登录所以 https 才打开。 */
  secure: boolean;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt(
    { sub: opts.userId, email: opts.email, iat: now, exp: now + SESSION_TTL_SEC },
    opts.secret,
  );
  return serializeCookie(sessionCookieName(opts.secure), token, {
    httpOnly: true,
    secure: opts.secure,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
}

export function clearSessionCookie(secure: boolean): string {
  return serializeCookie(sessionCookieName(secure), "", {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: 0,
  });
}

export async function readSession(req: Request, secret: string): Promise<SessionPayload | null> {
  // 根据请求协议确定 cookie 名（HTTPS → __Host-，HTTP → 普通名）；
  // 同时尝试另一种名称，兼容反向代理 protocol mismatch 边界情况。
  const secure = new URL(req.url).protocol === "https:";
  const cookies = parseCookies(req.headers.get("cookie"));
  const token = cookies[sessionCookieName(secure)] ?? cookies[sessionCookieName(!secure)];
  if (!token) return null;
  return verifyJwt<SessionPayload>(token, secret);
}

/** 短期 OAuth state cookie（5 分钟，HttpOnly），与 redirect 参数 state 一起做 CSRF 防护。 */
export function issueOAuthStateCookie(state: string, secure: boolean): string {
  return serializeCookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: 300,
  });
}

export function clearOAuthStateCookie(secure: boolean): string {
  return serializeCookie(OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: 0,
  });
}

export function readOAuthState(req: Request): string | null {
  return parseCookies(req.headers.get("cookie"))[OAUTH_STATE_COOKIE] || null;
}
