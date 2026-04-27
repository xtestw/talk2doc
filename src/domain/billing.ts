// 账单领域：创建充值订单、Stripe 回调把订单标 paid 同时给账户加分。
//
// 幂等：markPaid 用 status='pending' 作前置守卫，反复调用不会重复加分。
// 充值与"加分流水"在同一个 D1 batch，确保账实一致。

import { newId } from "../core/utils/id";
import type { DB } from "../infra/db/d1";
import type { BillingOrder, OrderStatus } from "./types";

export class BillingService {
  constructor(private readonly db: DB) {}

  async createPendingOrder(input: {
    sessionId: string;          // stripe checkout session id
    userId: string;
    packageId: string;
    amountCents: number;
    currency: string;
    creditsGranted: number;
  }): Promise<BillingOrder> {
    const now = Date.now();
    await this.db.exec(
      `INSERT INTO billing_orders
       (id, user_id, package_id, amount_cents, currency, credits_granted, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      input.sessionId,
      input.userId,
      input.packageId,
      input.amountCents,
      input.currency,
      input.creditsGranted,
      now,
    );
    return {
      id: input.sessionId,
      userId: input.userId,
      packageId: input.packageId,
      amountCents: input.amountCents,
      currency: input.currency,
      creditsGranted: input.creditsGranted,
      status: "pending",
      stripePaymentIntent: null,
      createdAt: now,
      paidAt: null,
    };
  }

  /**
   * 标记订单 paid 并给账户加分。
   * 幂等：仅当状态为 pending 时才会执行加分；重复 webhook 不会重复给积分。
   * 返回：本次实际是否新加了积分（false 表示已经处理过）。
   */
  async markPaid(sessionId: string, paymentIntent: string): Promise<{ applied: boolean }> {
    const order = await this.findById(sessionId);
    if (!order) throw new Error(`order not found: ${sessionId}`);
    if (order.status !== "pending") return { applied: false };

    const now = Date.now();
    const txId = newId();

    await this.db.batch([
      {
        sql: `UPDATE billing_orders
              SET status = 'paid', stripe_payment_intent = ?, paid_at = ?
              WHERE id = ? AND status = 'pending'`,
        binds: [paymentIntent, now, sessionId],
      },
      {
        sql: `UPDATE users SET credits = credits + ?, updated_at = ?
              WHERE id = ?`,
        binds: [order.creditsGranted, now, order.userId],
      },
      {
        sql: `INSERT INTO credit_transactions
              (id, user_id, delta, reason, ref_id, balance_after, created_at)
              SELECT ?, ?, ?, 'topup', ?, credits, ?
              FROM users WHERE id = ?`,
        binds: [txId, order.userId, order.creditsGranted, sessionId, now, order.userId],
      },
    ]);

    return { applied: true };
  }

  async markFailed(sessionId: string): Promise<void> {
    await this.db.exec(
      `UPDATE billing_orders SET status = 'failed' WHERE id = ? AND status = 'pending'`,
      sessionId,
    );
  }

  async findById(id: string): Promise<BillingOrder | null> {
    const r = await this.db.first<RawOrder>(
      `SELECT id, user_id, package_id, amount_cents, currency, credits_granted,
              status, stripe_payment_intent, created_at, paid_at
       FROM billing_orders WHERE id = ?`,
      id,
    );
    return r ? rowToOrder(r) : null;
  }

  async listByUser(userId: string, limit = 50): Promise<BillingOrder[]> {
    const rows = await this.db.all<RawOrder>(
      `SELECT id, user_id, package_id, amount_cents, currency, credits_granted,
              status, stripe_payment_intent, created_at, paid_at
       FROM billing_orders WHERE user_id = ?
       ORDER BY created_at DESC LIMIT ?`,
      userId,
      Math.min(Math.max(limit, 1), 200),
    );
    return rows.map(rowToOrder);
  }
}

interface RawOrder {
  id: string;
  user_id: string;
  package_id: string;
  amount_cents: number;
  currency: string;
  credits_granted: number;
  status: OrderStatus;
  stripe_payment_intent: string | null;
  created_at: number;
  paid_at: number | null;
}

function rowToOrder(r: RawOrder): BillingOrder {
  return {
    id: r.id,
    userId: r.user_id,
    packageId: r.package_id,
    amountCents: r.amount_cents,
    currency: r.currency,
    creditsGranted: r.credits_granted,
    status: r.status,
    stripePaymentIntent: r.stripe_payment_intent,
    createdAt: r.created_at,
    paidAt: r.paid_at,
  };
}
