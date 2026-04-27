// 内存 D1 stub：用 better-sqlite3 在本地起 SQLite，模拟 Cloudflare D1Database 的最小子集。
// 仅给 tests/ 用，不参与生产构建。
//
// 实现了：prepare / bind / first / all / run / batch（事务）。
// 行为差异：
//   · 不支持 D1 的 prepared 复用（每次 bind 都新建）；测试场景无所谓。
//   · meta.changes 用 SQLite 的 changes()。
//   · batch 包在 SQLite transaction，保证 all-or-nothing。

import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface RawStmt {
  bind(...params: unknown[]): BoundStmt;
}
interface BoundStmt {
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number; last_row_id: number } }>;
}

export class MemD1 {
  private readonly db: Database.Database;

  constructor() {
    this.db = new Database(":memory:");
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
  }

  static withMigrations(): MemD1 {
    const m = new MemD1();
    const sql = readFileSync(resolve(process.cwd(), "migrations/0001_init.sql"), "utf8");
    m.db.exec(sql);
    return m;
  }

  prepare(sql: string): RawStmt {
    const stmt = this.db.prepare(sql);
    return {
      bind: (...params: unknown[]): BoundStmt => ({
        first: async <T>(): Promise<T | null> => (stmt.get(...params) as T) ?? null,
        all: async <T>(): Promise<{ results: T[] }> => ({ results: stmt.all(...params) as T[] }),
        run: async () => {
          const r = stmt.run(...params);
          return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } };
        },
      }),
    };
  }

  async batch(prepared: BoundStmt[]): Promise<void> {
    // better-sqlite3 transaction 同步；但我们的 BoundStmt.run 是 async（包了 promise）。
    // 串行 await，保证前一条完成再写后一条；任意一条抛错则整体抛出。
    this.db.exec("BEGIN");
    try {
      for (const p of prepared) await p.run();
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /** 用于测试便利：直接执行 SQL（不要在生产代码引用）。 */
  exec(sql: string): void {
    this.db.exec(sql);
  }

  close(): void { this.db.close(); }
}

/** 让 src/infra/db/d1.ts 的 DB 类能直接吃这个 stub —— D1Database 接口结构兼容部分。 */
export function asD1(mem: MemD1): unknown {
  return mem;
}
