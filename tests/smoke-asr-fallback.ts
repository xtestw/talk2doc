// tests/smoke-asr-fallback.ts — 端到端验证 fallback + billed-strategy 的扣分语义。
//
// 用法：
//   npx tsx tests/smoke-asr-fallback.ts
//
// 不打网络。直接用 stub strategy 模拟："字幕成功不扣分 / 字幕失败走付费 ASR 扣分 /
// ASR 失败退分 / 余额不足直接 fatal 抛 InsufficientCreditsError"。

import { runWithFallback, type FallbackStrategy } from "../src/core/fallback";
import { withBilledStrategy } from "../src/core/billed-strategy";
import { CreditsService, InsufficientCreditsError } from "../src/domain/credits";
import { AuthRequiredError } from "../src/domain/errors";
import { UsersService } from "../src/domain/users";
import { DB } from "../src/infra/db/d1";
import { MemD1, asD1 } from "./_d1-mem";
import type { D1Database } from "@cloudflare/workers-types";

let pass = 0, fail = 0;
const log = (m: string) => console.log(m);
function check(name: string, ok: boolean, hint?: string) {
  if (ok) { pass++; log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; log(`  \x1b[31m✗\x1b[0m ${name}${hint ? "  — " + hint : ""}`); }
}

interface Ctx {
  user: { id: string } | null;
  credits: CreditsService;
  /** 控制 stub 行为 */
  free: "ok" | "empty" | "throw";
  paid: "ok" | "throw";
  asrCost: number;
}
interface Out { text: string; cost: number; via: string; }

const freeCaptionStrategy: FallbackStrategy<Ctx, Out> = {
  id: "youtube-caption",
  async run(ctx) {
    if (ctx.free === "throw") throw new Error("captions disabled");
    if (ctx.free === "empty") return null;
    return { text: "subs", cost: 0, via: "captions" };
  },
};

function paidAsrStrategy(): FallbackStrategy<Ctx, Out> {
  const inner: FallbackStrategy<Ctx, Out> = {
    id: "asr:cf-whisper",
    async run(ctx) {
      if (ctx.paid === "throw") throw new Error("asr crashed");
      return { text: "asr", cost: ctx.asrCost, via: "asr" };
    },
  };
  const billed = withBilledStrategy(inner, {
    estimateCost: (ctx) => ctx.asrCost,
    charge: (ctx, amt, refId) => {
      if (!ctx.user) throw new Error("unreachable: billed without user");
      return ctx.credits.charge(ctx.user.id, amt, "asr", refId).then(() => undefined);
    },
    refund: (ctx, amt, refId) => {
      if (!ctx.user) throw new Error("unreachable: refund without user");
      return ctx.credits.refund(ctx.user.id, amt, "asr_refund", refId).then(() => undefined);
    },
  });
  return {
    id: billed.id,
    async run(ctx) {
      if (!ctx.user) {
        throw new AuthRequiredError("asr_needed", ctx.asrCost);
      }
      return billed.run(ctx);
    },
  };
}

const isFatal = (e: unknown): boolean =>
  e instanceof InsufficientCreditsError || e instanceof AuthRequiredError;

async function setupUserWithBalance(db: DB, balance: number, userId = "u-test") {
  const users = new UsersService(db, balance);
  await users.upsertFromGoogle({ id: userId, email: "u@x.io" });
  return userId;
}

async function main() {
  const credits = (db: DB) => new CreditsService(db);

  // ---- A) 字幕成功 → 不扣分 ----
  log("\n[A] free caption succeeds");
  {
    const mem = MemD1.withMigrations();
    const db = new DB(asD1(mem) as D1Database);
    const uid = await setupUserWithBalance(db, 100);
    const c = credits(db);
    const ctx: Ctx = { user: { id: uid }, credits: c, free: "ok", paid: "ok", asrCost: 5 };
    const { result, tried } = await runWithFallback(ctx, [freeCaptionStrategy, paidAsrStrategy()], {
      fatal: isFatal,
    });
    check("got result via captions", result?.via === "captions");
    check("only first strategy tried", tried.length === 1, `tried=${tried.join(",")}`);
    check("balance unchanged == 100", (await c.getBalance(uid)) === 100);
    check("no asr-related tx", (await c.history(uid)).every((t) => t.reason !== "asr"));
    mem.close();
  }

  // ---- B) 字幕失败 → 走 ASR → 扣分 ----
  log("\n[B] caption empty → paid ASR succeeds (charged)");
  {
    const mem = MemD1.withMigrations();
    const db = new DB(asD1(mem) as D1Database);
    const uid = await setupUserWithBalance(db, 100);
    const c = credits(db);
    const ctx: Ctx = { user: { id: uid }, credits: c, free: "empty", paid: "ok", asrCost: 5 };
    const { result, tried } = await runWithFallback(ctx, [freeCaptionStrategy, paidAsrStrategy()], {
      fatal: isFatal,
    });
    check("got result via asr", result?.via === "asr");
    check("two strategies tried", tried.length === 2);
    check("balance == 95", (await c.getBalance(uid)) === 95, `got ${await c.getBalance(uid)}`);
    const txs = await c.history(uid);
    check("one asr charge tx", txs.filter((t) => t.reason === "asr").length === 1);
    check("no refund tx", txs.filter((t) => t.reason === "asr_refund").length === 0);
    mem.close();
  }

  // ---- C) ASR 失败 → 退分 → 整体走完没结果 ----
  log("\n[C] caption empty → ASR throws → refund");
  {
    const mem = MemD1.withMigrations();
    const db = new DB(asD1(mem) as D1Database);
    const uid = await setupUserWithBalance(db, 100);
    const c = credits(db);
    const ctx: Ctx = { user: { id: uid }, credits: c, free: "empty", paid: "throw", asrCost: 5 };
    const { result, errors } = await runWithFallback(ctx, [freeCaptionStrategy, paidAsrStrategy()], {
      fatal: isFatal,
    });
    check("no result", result === null);
    check("errors recorded", errors.length >= 1);
    check("balance restored == 100", (await c.getBalance(uid)) === 100, `got ${await c.getBalance(uid)}`);
    const txs = await c.history(uid);
    check("charge then refund (净 0)", txs.filter((t) => t.reason === "asr").length === 1 && txs.filter((t) => t.reason === "asr_refund").length === 1);
    mem.close();
  }

  // ---- D) 余额不足 → InsufficientCreditsError 立刻外抛 ----
  log("\n[D] insufficient credits → fatal");
  {
    const mem = MemD1.withMigrations();
    const db = new DB(asD1(mem) as D1Database);
    const uid = await setupUserWithBalance(db, 2);    // 余额比 cost 小
    const c = credits(db);
    const ctx: Ctx = { user: { id: uid }, credits: c, free: "empty", paid: "ok", asrCost: 5 };
    let thrown: unknown = null;
    try {
      await runWithFallback(ctx, [freeCaptionStrategy, paidAsrStrategy()], {
        fatal: isFatal,
      });
    } catch (e) { thrown = e; }
    check("thrown is InsufficientCreditsError", thrown instanceof InsufficientCreditsError);
    check("balance still 2 (no charge committed)", (await c.getBalance(uid)) === 2);
    mem.close();
  }

  // ---- E) 匿名 + 字幕不可用 → 需 ASR 时抛 AuthRequiredError（不计费） ----
  log("\n[E] anonymous + empty caption → AuthRequiredError (no charge)");
  {
    const mem = MemD1.withMigrations();
    const db = new DB(asD1(mem) as D1Database);
    const uid = await setupUserWithBalance(db, 100);
    const c = credits(db);
    const ctx: Ctx = { user: null, credits: c, free: "empty", paid: "ok", asrCost: 5 };
    let thrown: unknown = null;
    try {
      await runWithFallback(ctx, [freeCaptionStrategy, paidAsrStrategy()], { fatal: isFatal });
    } catch (e) {
      thrown = e;
    }
    check("thrown is AuthRequiredError", thrown instanceof AuthRequiredError);
    if (thrown instanceof AuthRequiredError) {
      check("estCost == 5", thrown.estCost === 5);
    }
    check("any previous user id balance unchanged (anon path)", (await c.getBalance(uid)) === 100);
    mem.close();
  }

  // ---- F) 匿名 + 字幕成功 → 直接出（无需登录） ----
  log("\n[F] anonymous + free caption ok");
  {
    const mem = MemD1.withMigrations();
    const db = new DB(asD1(mem) as D1Database);
    const c = credits(db);
    const ctx: Ctx = { user: null, credits: c, free: "ok", paid: "ok", asrCost: 5 };
    const { result, tried } = await runWithFallback(ctx, [freeCaptionStrategy, paidAsrStrategy()], {
      fatal: isFatal,
    });
    check("got result via captions", result?.via === "captions");
    check("only first strategy", tried.length === 1, `tried=${tried.join(",")}`);
    mem.close();
  }
}

main().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}).catch((e) => {
  console.error("\x1b[31m[fatal]\x1b[0m", e);
  process.exit(2);
});
