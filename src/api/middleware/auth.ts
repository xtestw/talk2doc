// 鉴权中间件：解 cookie → 注入 currentUser；未登录返回 401 JSON。
// 用 Higher-order handler 模式：requireAuth(handler) 返回包装后的 handler。

import { readSession } from "../../infra/auth/session";
import type { ApiContext } from "../context";
import type { Handler } from "../router";
import { err } from "../respond";

/** 不抛错，仅注入 currentUser；适合首页之类"登录与否都能访问"。 */
export function withAuth(handler: Handler): Handler {
  return async (req, ctx) => {
    const session = await readSession(req, ctx.config.sessionSecret);
    if (session) {
      const u = await ctx.services.users.getById(session.sub);
      if (u) ctx.currentUser = u;
    }
    return handler(req, ctx);
  };
}

/** 未登录直接 401；登录后注入 currentUser。 */
export function requireAuth(handler: Handler): Handler {
  return withAuth(async (req, ctx) => {
    if (!ctx.currentUser) return err(401, "unauthorized", "未登录或会话已过期");
    return handler(req, ctx as ApiContext & { currentUser: NonNullable<ApiContext["currentUser"]> });
  });
}
