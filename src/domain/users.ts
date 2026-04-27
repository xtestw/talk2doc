// 用户领域：upsert（首次登录赠送积分）、查询。
// 也在这里集中处理"首单赠送"的业务规则，避免散落在 OAuth 路由里。

import type { DB } from "../infra/db/d1";
import { newId } from "../core/utils/id";
import type { User } from "./types";

export interface UpsertProfile {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

export class UsersService {
  constructor(private readonly db: DB, private readonly signupBonus: number) {}

  async getById(id: string): Promise<User | null> {
    const r = await this.db.first<{
      id: string;
      email: string;
      name: string | null;
      picture: string | null;
      credits: number;
      created_at: number;
      updated_at: number;
    }>(
      `SELECT id, email, name, picture, credits, created_at, updated_at
       FROM users WHERE id = ?`,
      id,
    );
    if (!r) return null;
    return rowToUser(r);
  }

  /**
   * 按 google sub upsert。
   * 首次写入时，给 credits 注入注册赠送额，并写一条 signup_bonus 流水以保对账闭环。
   */
  async upsertFromGoogle(p: UpsertProfile): Promise<{ user: User; isNew: boolean }> {
    const existing = await this.getById(p.id);
    const now = Date.now();

    if (existing) {
      await this.db.exec(
        `UPDATE users SET email = ?, name = ?, picture = ?, updated_at = ? WHERE id = ?`,
        p.email,
        p.name ?? existing.name,
        p.picture ?? existing.picture,
        now,
        p.id,
      );
      return { user: { ...existing, email: p.email, name: p.name ?? existing.name, picture: p.picture ?? existing.picture, updatedAt: now }, isNew: false };
    }

    const initialCredits = Math.max(0, this.signupBonus);
    const txId = newId();
    await this.db.batch([
      {
        sql: `INSERT INTO users (id, email, name, picture, credits, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        binds: [p.id, p.email, p.name ?? "", p.picture ?? "", initialCredits, now, now],
      },
      ...(initialCredits > 0
        ? [
            {
              sql: `INSERT INTO credit_transactions
                    (id, user_id, delta, reason, ref_id, balance_after, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
              binds: [txId, p.id, initialCredits, "signup_bonus", null, initialCredits, now],
            },
          ]
        : []),
    ]);

    const user: User = {
      id: p.id,
      email: p.email,
      name: p.name ?? "",
      picture: p.picture ?? "",
      credits: initialCredits,
      createdAt: now,
      updatedAt: now,
    };
    return { user, isNew: true };
  }
}

function rowToUser(r: {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  credits: number;
  created_at: number;
  updated_at: number;
}): User {
  return {
    id: r.id,
    email: r.email,
    name: r.name ?? "",
    picture: r.picture ?? "",
    credits: r.credits,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
