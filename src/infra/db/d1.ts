// D1 薄封装：把 prepare-bind-run 噪声折叠为 first/all/exec/batch；保持类型安全。
// batch 内多条语句对 D1 是事务性的，"扣分 + 写流水"用 batch 即可保证原子。

import type { D1Database } from "@cloudflare/workers-types";

export interface SqlStmt {
  sql: string;
  binds?: readonly unknown[];
}

export class DB {
  constructor(private readonly d1: D1Database) {}

  /** 单行查询；命中 0 行返回 null。 */
  async first<T>(sql: string, ...binds: unknown[]): Promise<T | null> {
    return await this.d1.prepare(sql).bind(...binds).first<T>();
  }

  /** 多行查询；命中 0 行返回 []。 */
  async all<T>(sql: string, ...binds: unknown[]): Promise<T[]> {
    const { results } = await this.d1.prepare(sql).bind(...binds).all<T>();
    return results ?? [];
  }

  /** 写入；返回 affected rows。 */
  async exec(sql: string, ...binds: unknown[]): Promise<number> {
    const r = await this.d1.prepare(sql).bind(...binds).run();
    return r.meta?.changes ?? 0;
  }

  /** 事务批处理（D1 batch 内对所有语句原子）。 */
  async batch(stmts: readonly SqlStmt[]): Promise<void> {
    if (stmts.length === 0) return;
    const prepared = stmts.map((s) => this.d1.prepare(s.sql).bind(...(s.binds ?? [])));
    await this.d1.batch(prepared);
  }
}
