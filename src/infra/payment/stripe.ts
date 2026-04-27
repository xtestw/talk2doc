// Stripe REST + 自实现 webhook 验签。
// 不引 stripe SDK：Workers bundle 体积敏感；我们只用两个端点 + 一段 HMAC 校验。
//
// API 参考：
//   POST /v1/checkout/sessions     创建一次性收款 session
//   webhook 签名头：Stripe-Signature: t=<unix>,v1=<hex>
//   v1 = HMAC-SHA256(secret, `${t}.${rawBody}`)

import { hmacSha256Hex, timingSafeEqual } from "../../core/security/hmac";

const API = "https://api.stripe.com/v1";

export interface CheckoutInput {
  successUrl: string;
  cancelUrl: string;
  amountCents: number;
  currency: string;
  productName: string;
  /** 关联到我方 user.id，方便 webhook 回带。 */
  clientReferenceId: string;
  /** 业务元信息（如 packageId、orderId）。 */
  metadata?: Record<string, string>;
}

export interface CheckoutOutput {
  id: string;       // session id（cs_xxx）
  url: string;      // 跳转链接
}

export async function createCheckoutSession(
  secretKey: string,
  input: CheckoutInput,
): Promise<CheckoutOutput> {
  if (!secretKey) throw new Error("stripe secret key not configured");

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", input.successUrl);
  params.set("cancel_url", input.cancelUrl);
  params.set("client_reference_id", input.clientReferenceId);
  params.set("payment_method_types[0]", "card");

  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", input.currency);
  params.set("line_items[0][price_data][unit_amount]", String(input.amountCents));
  params.set("line_items[0][price_data][product_data][name]", input.productName);

  for (const [k, v] of Object.entries(input.metadata ?? {})) {
    params.set(`metadata[${k}]`, v);
  }

  const resp = await fetch(`${API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`stripe checkout: ${resp.status} ${detail}`);
  }
  const data = await resp.json() as { id: string; url: string };
  return { id: data.id, url: data.url };
}

/**
 * Stripe webhook 签名校验。
 * 入参用 raw body 字符串（不要 JSON.parse 后再回拼）。
 *
 * 算法（Stripe 文档）：
 *   1. 解析 Stripe-Signature: t=<timestamp>,v1=<sig>,...
 *   2. expected = HMAC-SHA256(secret, `${t}.${rawBody}`)
 *   3. 时序安全比较 expected 与 v1
 *   4. 校验 timestamp 落在 ±toleranceSec 内
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  toleranceSec = 300,
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;

  let t = "";
  const v1s: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === "t") t = v;
    else if (k === "v1") v1s.push(v);
  }
  if (!t || v1s.length === 0) return false;

  const ts = Number(t);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSec) return false;

  const expected = await hmacSha256Hex(`${t}.${rawBody}`, secret);
  return v1s.some((v1) => timingSafeEqual(expected, v1));
}

/** Stripe webhook 事件最小子集（我们只关心 checkout.session.completed）。 */
export interface CheckoutSessionCompletedEvent {
  type: "checkout.session.completed";
  data: {
    object: {
      id: string;                                   // session id
      payment_intent: string | null;
      client_reference_id: string | null;           // user.id
      payment_status: string;
      metadata?: Record<string, string>;
    };
  };
}
