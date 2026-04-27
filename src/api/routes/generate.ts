// POST /api/generate
//
// 编排流程：
//   1. withAuth：有 cookie 时注入 currentUser；匿名可直连（仅免费字幕）
//   2. VideoPipeline.run：免费字幕 → 需 ASR 时匿名则 AuthRequiredError（fatal）
//      - InsufficientCreditsError → SSE/HTTP 402
//   3. ArticleAgent.run：双版本流式写稿
//   4. 全程 SSE：status / chunk / error / done

import { ArticleAgent } from "../../app/article/article-agent";
import { VideoPipeline } from "../../app/video-pipeline";
import { InsufficientCreditsError } from "../../domain/credits";
import { AuthRequiredError } from "../../domain/errors";
import { selectAdapter } from "../../infra/llm";
import { withAuth } from "../middleware/auth";
import { encodeEvent } from "../sse";
import { err } from "../respond";
import type { Handler } from "../router";

interface GenerateBody {
  url?: string;
  provider?: string;       // "gemini" | "deepseek"（兼容 "openai"）
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export const generate: Handler = withAuth(async (req, ctx) => {
  const body = (await req.json().catch(() => null)) as GenerateBody | null;
  if (!body || !body.url?.trim()) {
    return err(400, "bad_request", "请求体缺少 url 字段");
  }

  const llm = selectAdapter(body.provider);
  const llmKey = body.apiKey?.trim() || pickServerKey(ctx, llm.id);
  if (!llmKey) {
    return err(400, "missing_api_key", `缺少 ${llm.displayName} 的 API Key（部署时配置环境变量或在页面填入）`);
  }

  const model = body.model?.trim() || (llm.id === "gemini" ? ctx.config.geminiModel : "");
  const baseUrl = body.baseUrl?.trim() || undefined;

  const pipeline = new VideoPipeline({
    pricing: ctx.services.pricing,
    credits: ctx.services.credits,
    asrJobs: ctx.services.asrJobs,
    asr: ctx.services.asr,
    logger: ctx.log,
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const send = (k: "status" | "chunk" | "subtitle" | "error" | "done", d: string) =>
        ctrl.enqueue(encodeEvent(k, d));

      try {
        send("status", "正在抓取字幕与关键帧…");

        const { transcript, strategy, cost } = await pipeline.run({
          url: body.url!,
          user: ctx.currentUser,
          signal: req.signal,
        });

        if (cost > 0 && ctx.currentUser) {
          const balance = await ctx.services.credits.getBalance(ctx.currentUser.id);
          send("status", `已使用 ${strategy}，扣 ${cost} 积分（余额 ${balance}）`);
        } else {
          send("status", `已使用免费字幕（${transcript.subtitleLines} 行 · ${transcript.subtitleLang}）`);
        }

        if (transcript.frames.length === 0) {
          send("status", "无关键帧 sprite，已退化为纯字幕模式");
        }
        send("subtitle", transcript.subtitle);

        for await (const ev of ArticleAgent.run({
          transcript,
          llm,
          apiKey: llmKey,
          model,
          baseUrl,
          signal: req.signal,
        })) {
          if (ev.kind === "chunk") send("chunk", ev.text);
          else if (ev.kind === "status") send("status", ev.message);
          else if (ev.kind === "error") {
            send("error", ev.message);
            break;
          }
        }
      } catch (e) {
        // 已经在 SSE body 里了，无法再发 HTTP 4xx；用 error 事件携带 code
        if (e instanceof InsufficientCreditsError) {
          send("error", JSON.stringify({
            code: "credits_insufficient",
            required: e.required,
            balance: e.balance,
          }));
        } else if (e instanceof AuthRequiredError) {
          send("error", JSON.stringify({
            code: "auth_required",
            reason: e.reason,
            estCost: e.estCost,
          }));
        } else {
          send("error", e instanceof Error ? e.message : String(e));
        }
      } finally {
        // done 事件统一在 finally 发送，保证无论成功/异常路径各发且仅发一次
        send("done", "");
        ctrl.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
});

function pickServerKey(ctx: { config: { geminiApiKey: string; deepseekApiKey: string } }, llmId: string): string {
  if (llmId === "gemini") return ctx.config.geminiApiKey;
  if (llmId === "deepseek") return ctx.config.deepseekApiKey;
  return "";
}
