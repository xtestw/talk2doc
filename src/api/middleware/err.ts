// 错误兜底：把 handler 抛出的异常翻成统一 JSON 响应；
// InsufficientCreditsError 翻 402，其他翻 500。

import { InsufficientCreditsError } from "../../domain/credits";
import { AuthRequiredError } from "../../domain/errors";
import type { ApiContext } from "../context";
import type { Handler } from "../router";
import { err } from "../respond";

export function withErr(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      return translateError(e, ctx);
    }
  };
}

export function translateError(e: unknown, ctx: ApiContext): Response {
  if (e instanceof InsufficientCreditsError) {
    return err(402, "credits_insufficient", "积分不足，请充值后重试", {
      required: e.required,
      balance: e.balance,
    });
  }
  if (e instanceof AuthRequiredError) {
    return err(401, "auth_required", e.message, {
      reason: e.reason,
      estCost: e.estCost,
    });
  }
  const msg = e instanceof Error ? e.message : String(e);
  ctx.log.error("unhandled_error", { error: msg, stack: e instanceof Error ? e.stack : undefined });
  return err(500, "internal_error", msg || "服务器内部错误");
}
