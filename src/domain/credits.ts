// 积分领域：扣分/退分/查余额/翻历史。
//
// 设计要点：
//   1. UPDATE users 加 `credits >= ?` 守卫，余额不够时本 batch 不会改任何东西。
//   2. INSERT credit_transactions 用 `SELECT credits FROM users WHERE id=? AND credits=?` 关联，
//      只有 update 真的发生（即 update 后 credits 等于预期新值）才会写一条流水，确保账实一致。
//   3. D1 batch 内多语句事务：要么全成，要么全不动。
//
// 调用方需自行处理 InsufficientCreditsError（HTTP 层翻译为 402）。

import { newId } from "../core/id";
import type { DB } from "../infra/db/d1";
import type { CreditReason, CreditTx } from "./types";

export class InsufficientCreditsError extends Error {
  readonly code = "credits_insufficient";
  constructor(readonly required: number, readonly balance: number) {
    super(`credits insufficient: required=${required} balance=${balance}`);
    this.name = "InsufficientCreditsError";
  }
}

export class CreditsService {
  constructor(private readonly db: DB) {}

  async getBalance(userId: string): Promise<number> {
    const u = await this.db.first<{ credits: number }>(
      "SELECT credits FROM users WHERE id = ?",
      userId,
    );
    return u?.credits ?? 0;
  }

  /**
   * 扣分（amount 为正数）。
   * 余额不足时抛 InsufficientCreditsError；事务保证流水与余额始终一致。
   */
  async charge(
    userId: string,
    amount: number,
    reason: CreditReason,
    refId?: string | null,
  ): Promise<{ balanceAfter: number; txId: string }> {
    if (amount <= 0) throw new Error(`charge amount must be > 0, got ${amount}`);
    const before = await this.getBalance(userId);
    if (before < amount) throw new InsufficientCreditsError(amount, before);

    const newBalance = before - amount;
    const txId = newId();
    const now = Date.now();

    await this.db.batch([
      {
        sql: `UPDATE users SET credits = ?, updated_at = ?
              WHERE id = ? AND credits >= ?`,
        binds: [newBalance, now, userId, amount],
      },
      {
        sql: `INSERT INTO credit_transactions
              (id, user_id, delta, reason, ref_id, balance_after, created_at)
              SELECT ?, ?, ?, ?, ?, credits, ?
              FROM users WHERE id = ? AND credits = ?`,
        binds: [txId, userId, -amount, reason, refId ?? null, now, userId, newBalance],
      },
    ]);

    // 自我校验：若并发把余额抢走，update 0 行、insert 0 行；当前余额会与 newBalance 不一致。
    const after = await this.getBalance(userId);
    if (after !== newBalance) {
      throw new InsufficientCreditsError(amount, before);
    }
    return { balanceAfter: after, txId };
  }

  /**
   * 退分（amount 为正数）。退分总能成功（不存在余额上限），用 batch 保证原子。
   */
  async refund(
    userId: string,
    amount: number,
    reason: CreditReason,
    refId?: string | null,
  ): Promise<{ balanceAfter: number; txId: string }> {
    if (amount <= 0) throw new Error(`refund amount must be > 0, got ${amount}`);
    const before = await this.getBalance(userId);
    const newBalance = before + amount;
    const txId = newId();
    const now = Date.now();

    await this.db.batch([
      {
        sql: `UPDATE users SET credits = credits + ?, updated_at = ?
              WHERE id = ?`,
        binds: [amount, now, userId],
      },
      {
        sql: `INSERT INTO credit_transactions
              (id, user_id, delta, reason, ref_id, balance_after, created_at)
              SELECT ?, ?, ?, ?, ?, credits, ?
              FROM users WHERE id = ?`,
        binds: [txId, userId, amount, reason, refId ?? null, now, userId],
      },
    ]);

    return { balanceAfter: newBalance, txId };
  }

  async history(userId: string, limit = 50): Promise<CreditTx[]> {
    const rows = await this.db.all<{
      id: string;
      user_id: string;
      delta: number;
      reason: string;
      ref_id: string | null;
      balance_after: number;
      created_at: number;
    }>(
      `SELECT id, user_id, delta, reason, ref_id, balance_after, created_at
       FROM credit_transactions
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      userId,
      Math.min(Math.max(limit, 1), 200),
    );
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      delta: r.delta,
      reason: r.reason,
      refId: r.ref_id,
      balanceAfter: r.balance_after,
      createdAt: r.created_at,
    }));
  }
}
