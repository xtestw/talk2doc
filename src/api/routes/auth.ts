// /api/auth/* 路由
//
// GET  /api/auth/google/start    → 跳 Google 同意页
// GET  /api/auth/google/callback → 拿 code 换 user，写 cookie，跳回首页
// POST /api/auth/logout          → 清 cookie
// GET  /api/auth/me              → 当前用户 + 余额（未登录返回 null）
//
// state 用 HMAC 防 CSRF：state = `${nonce}.${HMAC(SESSION_SECRET, nonce)}`，并把 nonce 写到短期 cookie。
// callback 校验三件：cookie 里的 nonce ≡ url state 前半段、url state HMAC 通过、code 兑换成功。

import { hmacSha256Hex, timingSafeEqual } from "../../core/hmac";
import { newId } from "../../core/id";
import {
  buildAuthUrl,
  exchangeCodeForUser,
  type GoogleOAuthConfig,
} from "../../infra/auth/google-oauth";
import {
  clearOAuthStateCookie,
  clearSessionCookie,
  issueOAuthStateCookie,
  issueSessionCookie,
  readOAuthState,
} from "../../infra/auth/session";
import type { ApiContext } from "../context";
import { withAuth } from "../middleware/auth";
import { err, json, redirect } from "../respond";
import type { Handler } from "../router";

function googleConfig(ctx: ApiContext): GoogleOAuthConfig {
  return {
    clientId: ctx.config.googleClientId,
    clientSecret: ctx.config.googleClientSecret,
    redirectUri: `${ctx.config.appBaseUrl}/api/auth/google/callback`,
  };
}

async function signState(nonce: string, secret: string): Promise<string> {
  const sig = await hmacSha256Hex(nonce, secret);
  return `${nonce}.${sig}`;
}

async function verifyState(state: string, secret: string): Promise<string | null> {
  const dot = state.indexOf(".");
  if (dot === -1) return null;
  const nonce = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = await hmacSha256Hex(nonce, secret);
  return timingSafeEqual(expected, sig) ? nonce : null;
}

export const startGoogle: Handler = async (_req, ctx) => {
  if (!ctx.config.googleClientId || !ctx.config.googleClientSecret) {
    return err(500, "google_oauth_not_configured", "Google OAuth 未配置（GOOGLE_CLIENT_ID/SECRET 缺失）");
  }
  if (!ctx.config.sessionSecret) {
    return err(500, "session_not_configured", "SESSION_SECRET 未配置");
  }
  const nonce = newId();
  const state = await signState(nonce, ctx.config.sessionSecret);
  const url = buildAuthUrl(googleConfig(ctx), state);
  return redirect(url, {
    headers: { "Set-Cookie": issueOAuthStateCookie(nonce, ctx.secureCookie) },
  });
};

export const callbackGoogle: Handler = async (req, ctx) => {
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const cookieNonce = readOAuthState(req);
  if (!code || !state) return err(400, "bad_request", "missing code/state");

  const verifiedNonce = await verifyState(state, ctx.config.sessionSecret);
  if (!verifiedNonce || !cookieNonce || verifiedNonce !== cookieNonce) {
    return err(400, "bad_state", "OAuth state 校验失败");
  }

  const profile = await exchangeCodeForUser(googleConfig(ctx), code);
  const { user, isNew } = await ctx.services.users.upsertFromGoogle({
    id: profile.sub,
    email: profile.email,
    name: profile.name,
    picture: profile.picture,
  });
  ctx.log.info("login_success", { userId: user.id, isNew });

  const sessionCookie = await issueSessionCookie({
    userId: user.id,
    email: user.email,
    secret: ctx.config.sessionSecret,
    secure: ctx.secureCookie,
  });
  const headers = new Headers({ Location: "/", "Cache-Control": "no-store" });
  headers.append("Set-Cookie", sessionCookie);
  headers.append("Set-Cookie", clearOAuthStateCookie(ctx.secureCookie));
  return new Response(null, { status: 302, headers });
};

export const logout: Handler = async (_req, ctx) => {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": clearSessionCookie(ctx.secureCookie),
    },
  });
};

export const me: Handler = withAuth(async (_req, ctx) => {
  if (!ctx.currentUser) return json({ user: null });
  const u = ctx.currentUser;
  return json({
    user: {
      id: u.id,
      email: u.email,
      name: u.name,
      picture: u.picture,
      credits: u.credits,
    },
  });
});
