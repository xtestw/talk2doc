// HTTP 响应工厂：JSON / 错误 / 重定向，统一 Content-Type 与 cache-control。
// 不让任何路由处理函数手写 `new Response(JSON.stringify(...), {...})`。

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

export function err(status: number, code: string, message: string, extra?: Record<string, unknown>): Response {
  return json({ error: code, message, ...extra }, { status });
}

export function redirect(url: string, init: ResponseInit = {}): Response {
  return new Response(null, {
    ...init,
    status: 302,
    headers: {
      Location: url,
      "Cache-Control": "no-store",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}
