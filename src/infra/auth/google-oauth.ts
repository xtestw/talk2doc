// Google OAuth 2.0 Authorization Code 流程的最小实现。
// 我们只要拿到 sub/email/name/picture，所以不解析 id_token，直接调 userinfo endpoint。

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleUser {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

/** 构造跳转到 Google 同意页的 URL；state 由调用方签名以防 CSRF。 */
export function buildAuthUrl(cfg: GoogleOAuthConfig, state: string): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("access_type", "online");
  u.searchParams.set("prompt", "select_account");
  u.searchParams.set("state", state);
  return u.toString();
}

/** code → access_token → userinfo。失败抛 Error。 */
export async function exchangeCodeForUser(
  cfg: GoogleOAuthConfig,
  code: string,
): Promise<GoogleUser> {
  const tokenResp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!tokenResp.ok) {
    const detail = await tokenResp.text().catch(() => "");
    throw new Error(`google token exchange failed: ${tokenResp.status} ${detail}`);
  }
  const tokens = await tokenResp.json() as { access_token?: string };
  if (!tokens.access_token) throw new Error("google token: missing access_token");

  const userResp = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userResp.ok) {
    const detail = await userResp.text().catch(() => "");
    throw new Error(`google userinfo failed: ${userResp.status} ${detail}`);
  }
  const u = await userResp.json() as GoogleUser;
  if (!u.sub || !u.email) throw new Error("google userinfo: missing sub/email");
  // email_verified 字段在标准 Google userinfo v3 中始终存在；
  // 仅允许已验证邮箱登录，防止账户伪造或枚举攻击。
  if (u.email_verified === false) throw new Error("google userinfo: email not verified");
  return u;
}
