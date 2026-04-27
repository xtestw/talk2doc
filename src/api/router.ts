// 极简 router：method + 精确路径匹配。
// 不引 itty-router / hono；规模小，本地实现一目了然。

import type { ApiContext } from "./context";

export type Handler = (req: Request, ctx: ApiContext) => Promise<Response> | Response;

export interface Route {
  method: "GET" | "POST" | "DELETE" | "PUT";
  path: string;
  handler: Handler;
}

export function GET(path: string, handler: Handler): Route {
  return { method: "GET", path, handler };
}
export function POST(path: string, handler: Handler): Route {
  return { method: "POST", path, handler };
}

export function matchRoute(routes: readonly Route[], method: string, pathname: string): Handler | null {
  for (const r of routes) {
    if (r.method === method && r.path === pathname) return r.handler;
  }
  return null;
}
