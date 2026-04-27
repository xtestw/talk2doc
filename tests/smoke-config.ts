// tests/smoke-config.ts — 验证配置解析的边界行为。
import { loadConfig } from "../src/infra/config";

let pass = 0;
let fail = 0;
const log = (m: string) => console.log(m);

function check(name: string, ok: boolean, hint?: string) {
  if (ok) {
    pass++;
    log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    fail++;
    log(`  \x1b[31m✗\x1b[0m ${name}${hint ? "  — " + hint : ""}`);
  }
}

function main() {
  log("\n[1] signup bonus allow zero");
  const cfg = loadConfig({
    GEMINI_API_KEY: "",
    DEEPSEEK_API_KEY: "",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    SESSION_SECRET: "abc",
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    SIGNUP_BONUS_CREDITS: "0",
  });
  check("SIGNUP_BONUS_CREDITS=0 should stay 0", cfg.signupBonusCredits === 0, `got ${cfg.signupBonusCredits}`);
}

main();
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
