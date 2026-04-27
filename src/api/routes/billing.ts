// /api/billing/* 路由
//
// POST /api/billing/checkout         登录用户发起 Stripe checkout，落 pending 订单
// POST /api/billing/stripe-webhook   Stripe 回调，验签后把 paid 订单加分（幂等）
// GET  /api/billing/history          登录用户的订单 + 流水

import {
  createCheckoutSession,
  verifyWebhookSignature,
  type CheckoutSessionCompletedEvent,
} from "../../infra/payment/stripe";
import { requireAuth } from "../middleware/auth";
import { err, json } from "../respond";
import type { Handler } from "../router";

export const checkout: Handler = requireAuth(async (req, ctx) => {
  if (!ctx.config.stripeSecretKey) {
    return err(500, "stripe_not_configured", "STRIPE_SECRET_KEY 未配置");
  }
  const body = (await req.json().catch(() => null)) as { packageId?: string } | null;
  const pkg = body?.packageId ? ctx.services.pricing.findPackage(body.packageId) : null;
  if (!pkg) return err(400, "bad_request", "未知套餐 packageId");

  const successUrl = `${ctx.config.appBaseUrl}/?topup=success`;
  const cancelUrl = `${ctx.config.appBaseUrl}/?topup=cancel`;

  const session = await createCheckoutSession(ctx.config.stripeSecretKey, {
    successUrl,
    cancelUrl,
    amountCents: pkg.cents,
    currency: pkg.currency,
    productName: `Talk2Doc · ${pkg.label}`,
    clientReferenceId: ctx.currentUser!.id,
    metadata: {
      package_id: pkg.id,
      credits: String(pkg.credits),
    },
  });

  await ctx.services.billing.createPendingOrder({
    sessionId: session.id,
    userId: ctx.currentUser!.id,
    packageId: pkg.id,
    amountCents: pkg.cents,
    currency: pkg.currency,
    creditsGranted: pkg.credits,
  });

  return json({ url: session.url, sessionId: session.id });
});

const WEBHOOK_MAX_BYTES = 65_536; // 64KB；Stripe 实际 payload 通常 < 4KB

export const webhook: Handler = async (req, ctx) => {
  if (!ctx.config.stripeWebhookSecret) {
    return err(500, "stripe_webhook_not_configured", "STRIPE_WEBHOOK_SECRET 未配置");
  }
  const raw = await req.text();
  if (raw.length > WEBHOOK_MAX_BYTES) {
    ctx.log.warn("stripe_webhook_payload_too_large", { bytes: raw.length });
    return err(413, "payload_too_large", "webhook payload 超过 64KB 限制");
  }
  const ok = await verifyWebhookSignature(
    raw,
    req.headers.get("stripe-signature"),
    ctx.config.stripeWebhookSecret,
  );
  if (!ok) {
    ctx.log.warn("stripe_webhook_bad_signature");
    return err(400, "bad_signature", "签名校验失败");
  }

  const evt = JSON.parse(raw) as { type: string; data: { object: Record<string, unknown> } };

  if (evt.type !== "checkout.session.completed") {
    return json({ ok: true, ignored: evt.type });
  }
  const e = evt as unknown as CheckoutSessionCompletedEvent;
  const obj = e.data.object;
  if (obj.payment_status !== "paid") {
    return json({ ok: true, ignored: "not_paid" });
  }
  const r = await ctx.services.billing.markPaid(obj.id, obj.payment_intent ?? "");
  ctx.log.info("stripe_paid", { sessionId: obj.id, applied: r.applied });
  return json({ ok: true, applied: r.applied });
};

export const history: Handler = requireAuth(async (_req, ctx) => {
  const [orders, txs] = await Promise.all([
    ctx.services.billing.listByUser(ctx.currentUser!.id),
    ctx.services.credits.history(ctx.currentUser!.id),
  ]);
  return json({ orders, txs });
});
