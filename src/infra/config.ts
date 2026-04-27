// 配置 facade：所有 env 读取在此一次性发生，下游业务只引用结构化 AppConfig。
// 设计目标：每个字段都有默认值与类型；缺少敏感配置时延迟到使用点报错（避免冷启即崩）。

import type { Ai, D1Database } from "@cloudflare/workers-types";

export interface TopupPackage {
  id: string;
  label: string;
  cents: number;
  credits: number;
  currency: string;
}

export interface AppConfig {
  // LLM
  geminiApiKey: string;
  geminiModel: string;
  deepseekApiKey: string;
  defaultLlmProvider: "gemini" | "deepseek";

  // Auth
  googleClientId: string;
  googleClientSecret: string;
  sessionSecret: string;

  // Payment
  stripeSecretKey: string;
  stripeWebhookSecret: string;

  // App
  appBaseUrl: string;

  // Pricing
  pricingPerMinuteCredits: number;
  signupBonusCredits: number;
  topupPackages: TopupPackage[];
}

/** Worker bindings + secrets 的并集，从 wrangler.toml 注入。 */
export interface RawEnv {
  // Bindings
  DB?: D1Database;
  AI?: Ai;

  // Secrets
  GEMINI_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;

  // Vars
  GEMINI_MODEL?: string;
  DEFAULT_LLM_PROVIDER?: string;
  APP_BASE_URL?: string;
  PRICING_PER_MINUTE_CREDITS?: string;
  SIGNUP_BONUS_CREDITS?: string;
  TOPUP_PACKAGES_JSON?: string;
}

export function loadConfig(env: RawEnv): AppConfig {
  return {
    geminiApiKey: str(env.GEMINI_API_KEY),
    geminiModel: str(env.GEMINI_MODEL, "gemini-2.5-flash"),
    deepseekApiKey: str(env.DEEPSEEK_API_KEY),
    defaultLlmProvider: pickProvider(env.DEFAULT_LLM_PROVIDER),

    googleClientId: str(env.GOOGLE_CLIENT_ID),
    googleClientSecret: str(env.GOOGLE_CLIENT_SECRET),
    sessionSecret: str(env.SESSION_SECRET),

    stripeSecretKey: str(env.STRIPE_SECRET_KEY),
    stripeWebhookSecret: str(env.STRIPE_WEBHOOK_SECRET),

    appBaseUrl: str(env.APP_BASE_URL, "http://localhost:8787"),

    pricingPerMinuteCredits: int(env.PRICING_PER_MINUTE_CREDITS, 1),
    signupBonusCredits: nonNegativeInt(env.SIGNUP_BONUS_CREDITS, 0),
    topupPackages: parsePackages(env.TOPUP_PACKAGES_JSON),
  };
}

function str(v: string | undefined, fallback = ""): string {
  return (v ?? "").trim() || fallback;
}

function int(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function nonNegativeInt(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function pickProvider(v: string | undefined): "gemini" | "deepseek" {
  return v === "deepseek" ? "deepseek" : "gemini";
}

function parsePackages(raw: string | undefined): TopupPackage[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as Partial<TopupPackage>[];
    return arr
      .filter((p) => p && typeof p.id === "string" && typeof p.cents === "number" && typeof p.credits === "number")
      .map((p) => ({
        id: String(p.id),
        label: String(p.label || p.id),
        cents: Math.floor(Number(p.cents)),
        credits: Math.floor(Number(p.credits)),
        currency: String(p.currency || "usd").toLowerCase(),
      }));
  } catch {
    return [];
  }
}
