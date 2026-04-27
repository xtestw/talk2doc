// tests/smoke-credits.ts — 用内存 SQLite 跑 CreditsService / BillingService / UsersService。
//
// 用法：
//   npx tsx tests/smoke-credits.ts
//
// 覆盖：
//   1. signup bonus → 流水写入
//   2. charge 成功 / 余额不足抛 InsufficientCreditsError
//   3. refund 成功
//   4. billing.markPaid 幂等

import { DB } from "../src/infra/db/d1";
import { CreditsService, InsufficientCreditsError } from "../src/domain/credits";
import { UsersService } from "../src/domain/users";
import { BillingService } from "../src/domain/billing";
import { MemD1, asD1 } from "./_d1-mem";
import type { D1Database } from "@cloudflare/workers-types";

let pass = 0, fail = 0;
const log = (m: string) => console.log(m);
function check(name: string, ok: boolean, hint?: string) {
  if (ok) { pass++; log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; log(`  \x1b[31m✗\x1b[0m ${name}${hint ? "  — " + hint : ""}`); }
}

async function main() {
  const mem = MemD1.withMigrations();
  const db = new DB(asD1(mem) as D1Database);

  const credits = new CreditsService(db);
  const users = new UsersService(db, /* signupBonus */ 50);
  const billing = new BillingService(db);

  // ---- 1) 注册赠送 ----
  log("\n[1] signup bonus");
  const u1 = await users.upsertFromGoogle({ id: "google-1", email: "a@x.io", name: "Alice", picture: null });
  check("isNew=true on first upsert", u1.isNew);
  check("credits == 50 (signup bonus)", u1.user.credits === 50, `got ${u1.user.credits}`);
  const balanceA = await credits.getBalance("google-1");
  check("balance via service == 50", balanceA === 50);
  const tx0 = await credits.history("google-1");
  check("first tx is signup +50", tx0.length === 1 && tx0[0].delta === 50 && tx0[0].reason === "signup_bonus");

  // 再次 upsert 不重复发放
  const u1b = await users.upsertFromGoogle({ id: "google-1", email: "a@x.io", name: "Alice", picture: null });
  check("second upsert isNew=false", !u1b.isNew);
  check("balance still 50 after re-upsert", (await credits.getBalance("google-1")) === 50);

  // ---- 2) charge ----
  log("\n[2] charge");
  const c1 = await credits.charge("google-1", 20, "asr", "job-1");
  check("balance after charge 20 == 30", c1.balanceAfter === 30, `got ${c1.balanceAfter}`);

  let threw = false;
  try { await credits.charge("google-1", 9999, "asr", "job-2"); }
  catch (e) { threw = e instanceof InsufficientCreditsError; }
  check("charge over balance throws InsufficientCreditsError", threw);
  check("balance unchanged after failed charge", (await credits.getBalance("google-1")) === 30);

  // ---- 3) refund ----
  log("\n[3] refund");
  const r1 = await credits.refund("google-1", 5, "asr_refund", "job-1");
  check("balance after refund 5 == 35", r1.balanceAfter === 35);

  // ---- 4) billing markPaid 幂等 ----
  log("\n[4] billing markPaid idempotent");
  await billing.createPendingOrder({
    sessionId: "cs_test_1", userId: "google-1",
    packageId: "small", amountCents: 500, currency: "usd", creditsGranted: 100,
  });
  const m1 = await billing.markPaid("cs_test_1", "pi_test_1");
  check("first markPaid applied=true", m1.applied);
  check("balance after pay == 35 + 100 = 135", (await credits.getBalance("google-1")) === 135);
  const m2 = await billing.markPaid("cs_test_1", "pi_test_1");
  check("second markPaid applied=false (idempotent)", !m2.applied);
  check("balance unchanged on dup webhook == 135", (await credits.getBalance("google-1")) === 135);

  // ---- 5) history shape ----
  log("\n[5] history");
  const txs = await credits.history("google-1");
  check("history has 4 rows (signup, charge, refund, topup)", txs.length === 4, `got ${txs.length}`);
  check("history sorted desc", txs[0].createdAt >= txs[txs.length - 1].createdAt);

  mem.close();
}

main().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}).catch((e) => {
  console.error("\x1b[31m[fatal]\x1b[0m", e);
  process.exit(2);
});
