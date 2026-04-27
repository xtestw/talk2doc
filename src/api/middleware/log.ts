// 访问日志：进入时记 method/path，结束时记 status/duration。
// 流式响应（SSE）只记开始/headers 状态，body 时长不可知。

import type { Handler } from "../router";

export function withLog(handler: Handler): Handler {
  return async (req, ctx) => {
    const start = Date.now();
    ctx.log.info("req_start");
    try {
      const resp = await handler(req, ctx);
      ctx.log.info("req_end", { status: resp.status, durationMs: Date.now() - start });
      return resp;
    } catch (e) {
      ctx.log.error("req_throw", {
        error: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - start,
      });
      throw e;
    }
  };
}
