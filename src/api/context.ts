// 单次请求的 service container：把 env/config/db/domain services/asr 等挑齐塞在一起。
// 路由处理函数只接 (req, ctx)，不再自己 new 来 new 去。

import type { D1Database } from "@cloudflare/workers-types";
import type { AppConfig, RawEnv } from "../infra/config";
import { loadConfig } from "../infra/config";
import { newId } from "../core/utils/id";
import type { Logger } from "../core/utils/log";
import { logger as rootLogger } from "../core/utils/log";
import { DB } from "../infra/db/d1";
import { CreditsService } from "../domain/credits";
import { BillingService } from "../domain/billing";
import { UsersService } from "../domain/users";
import { AsrJobsService } from "../domain/asr-jobs";
import { ConversionsService } from "../domain/conversions";
import { Pricing } from "../domain/pricing";
import { makeCfWhisper } from "../infra/asr/cf-whisper";
import type { AsrProvider } from "../infra/asr/types";
import type { User } from "../domain/types";

export interface Services {
  db: DB;
  pricing: Pricing;
  credits: CreditsService;
  billing: BillingService;
  users: UsersService;
  asrJobs: AsrJobsService;
  conversions: ConversionsService;
  asr: AsrProvider | null;
}

export interface ApiContext {
  env: RawEnv;
  config: AppConfig;
  services: Services;
  /** 当前登录用户；中间件 requireAuth 注入。 */
  currentUser: User | null;
  log: Logger;
  requestId: string;
  /** 是否生产 https；用于 cookie secure 标志。 */
  secureCookie: boolean;
}

export function buildContext(req: Request, env: RawEnv): ApiContext {
  const config = loadConfig(env);
  const requestId = newId();
  const log = rootLogger.with({ requestId, path: new URL(req.url).pathname, method: req.method });

  const db = new DB(requireDb(env));
  const services: Services = {
    db,
    pricing: new Pricing(config),
    credits: new CreditsService(db),
    billing: new BillingService(db),
    users: new UsersService(db, config.signupBonusCredits),
    asrJobs: new AsrJobsService(db),
    conversions: new ConversionsService(db),
    asr: env.AI ? makeCfWhisper({ ai: env.AI }) : null,
  };

  return {
    env,
    config,
    services,
    currentUser: null,
    log,
    requestId,
    secureCookie: new URL(req.url).protocol === "https:",
  };
}

function requireDb(env: RawEnv): D1Database {
  if (!env.DB) {
    throw new Error(
      "D1 binding 'DB' missing. 跑 `npx wrangler d1 create talk2doc` 并把 database_id 写进 wrangler.toml。",
    );
  }
  return env.DB;
}
