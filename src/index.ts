// Cloudflare Worker 入口（路由表 + 中间件链）。
//
// 设计原则：
//   - 单一文件做"该路径走哪个 handler"，所有业务在 routes/ 里。
//   - 三层中间件包装：withLog → withErr → handler；errors 都翻成 JSON。
//   - context 构建一次（含 D1/AI 绑定、domain services），传给所有 handler。

import * as auth from "./api/routes/auth";
import * as billing from "./api/routes/billing";
import * as conversions from "./api/routes/conversions";
import * as pricing from "./api/routes/pricing";
import { generate } from "./api/routes/generate";
import { buildContext } from "./api/context";
import { withErr } from "./api/middleware/err";
import { withLog } from "./api/middleware/log";
import { GET, POST, matchRoute, type Route } from "./api/router";
import type { RawEnv } from "./infra/config";
import { INDEX_HTML } from "./web/index";
import { ORDERS_HTML } from "./web/orders";
import { PREVIEW_HTML } from "./web/preview";

const serveIndex = (): Response =>
  new Response(INDEX_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });

const serveOrders = (): Response =>
  new Response(ORDERS_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });

const servePreview = (): Response =>
  new Response(PREVIEW_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });

const routes: Route[] = [
  GET("/", serveIndex),
  GET("/orders", serveOrders),
  GET("/preview", servePreview),

  GET("/api/auth/me", auth.me),
  GET("/api/auth/google/start", auth.startGoogle),
  GET("/api/auth/google/callback", auth.callbackGoogle),
  POST("/api/auth/logout", auth.logout),

  GET("/api/pricing", pricing.list),
  POST("/api/billing/checkout", billing.checkout),
  POST("/api/billing/stripe-webhook", billing.webhook),
  GET("/api/billing/history", billing.history),
  GET("/api/conversions/history", conversions.history),
  GET("/api/conversions/detail", conversions.detail),
  POST("/api/conversions/delete", conversions.remove),

  POST("/api/generate", generate),
];

export default {
  async fetch(req: Request, env: RawEnv): Promise<Response> {
    let ctx;
    try {
      ctx = buildContext(req, env);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "service_unavailable", message: e instanceof Error ? e.message : String(e) }),
        { status: 503, headers: { "Content-Type": "application/json; charset=utf-8" } },
      );
    }
    const url = new URL(req.url);
    const handler = matchRoute(routes, req.method, url.pathname);
    if (!handler) return new Response("Not Found", { status: 404 });
    return withLog(withErr(handler))(req, ctx);
  },
} satisfies ExportedHandler<RawEnv>;
