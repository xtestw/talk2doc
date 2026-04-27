// POST /api/generate
//
// 支持断线续传：
//   - 首次请求：不传 jobId，服务端创建任务并返回 job 事件（含 jobId）
//   - 重连请求：传 jobId + fromSeq，服务端先补发缺失事件，再继续推流
//   - 事件带自增 id（seq），前端据此断点续传

import { ArticleAgent } from "../../app/article/article-agent";
import { VideoPipeline } from "../../app/video-pipeline";
import { newId } from "../../core/utils/id";
import { InsufficientCreditsError } from "../../domain/credits";
import { AuthRequiredError } from "../../domain/errors";
import { selectAdapter } from "../../infra/llm";
import { withAuth } from "../middleware/auth";
import { encodeEventWithId, type SseKind } from "../sse";
import { err } from "../respond";
import type { Handler } from "../router";

interface GenerateBody {
  url?: string;
  provider?: string;       // "gemini" | "deepseek"（兼容 "openai"）
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  jobId?: string;
  fromSeq?: number;
}

interface StoredEvent {
  seq: number;
  kind: SseKind;
  data: string;
}

interface GenerateJob {
  id: string;
  events: StoredEvent[];
  listeners: Set<ReadableStreamDefaultController<Uint8Array>>;
  done: boolean;
  createdAt: number;
  updatedAt: number;
  nextSeq: number;
}

const jobs = new Map<string, GenerateJob>();
const JOB_TTL_MS = 15 * 60 * 1000;

function sweepJobs(now = Date.now()): void {
  for (const [id, job] of jobs) {
    if (job.done && job.listeners.size === 0 && now - job.updatedAt > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}

function publish(job: GenerateJob, kind: SseKind, data: string): void {
  const ev: StoredEvent = { seq: job.nextSeq++, kind, data };
  job.events.push(ev);
  job.updatedAt = Date.now();
  const bytes = encodeEventWithId(ev.seq, ev.kind, ev.data);
  for (const l of job.listeners) l.enqueue(bytes);
  if (kind === "done") {
    job.done = true;
    for (const l of job.listeners) l.close();
    job.listeners.clear();
  }
}

function attachStream(job: GenerateJob, fromSeq: number, signal: AbortSignal): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(ctrl) {
      for (const ev of job.events) {
        if (ev.seq > fromSeq) ctrl.enqueue(encodeEventWithId(ev.seq, ev.kind, ev.data));
      }
      if (job.done) {
        ctrl.close();
        return;
      }
      job.listeners.add(ctrl);
      const onAbort = () => {
        job.listeners.delete(ctrl);
        try { ctrl.close(); } catch {}
      };
      signal.addEventListener("abort", onAbort, { once: true });
    },
  });
}

export const generate: Handler = withAuth(async (req, ctx) => {
  sweepJobs();
  const body = (await req.json().catch(() => null)) as GenerateBody | null;
  if (!body || !body.url?.trim()) {
    return err(400, "bad_request", "请求体缺少 url 字段");
  }
  const resumeJobId = body.jobId?.trim();
  const fromSeq = Number.isFinite(body.fromSeq) ? Number(body.fromSeq) : 0;

  let job: GenerateJob | undefined;
  if (resumeJobId) {
    job = jobs.get(resumeJobId);
    if (!job) return err(404, "job_not_found", "续传任务不存在或已过期");
  } else {
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
    job = {
      id: newId(),
      events: [],
      listeners: new Set(),
      done: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      nextSeq: 1,
    };
    jobs.set(job.id, job);
    publish(job, "job", JSON.stringify({ jobId: job.id, createdAt: job.createdAt }));
    void runJob(job, {
      req,
      ctx,
      body,
      llm,
      llmKey,
      model,
      baseUrl,
      pipeline,
    });
  }

  const stream = attachStream(job, Math.max(0, fromSeq), req.signal);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Generate-Job-Id": job.id,
      Connection: "keep-alive",
    },
  });
});

async function runJob(
  job: GenerateJob,
  deps: {
    req: Request;
    ctx: Parameters<Handler>[1];
    body: GenerateBody;
    llm: ReturnType<typeof selectAdapter>;
    llmKey: string;
    model: string;
    baseUrl?: string;
    pipeline: VideoPipeline;
  },
): Promise<void> {
  const { req, ctx, body, llm, llmKey, model, baseUrl, pipeline } = deps;
  const log = ctx.log.with({
    component: "generate-route",
    path: "/api/generate",
    provider: llm.id,
    jobId: job.id,
  });
  try {
    log.info("pipeline_start", {
      url: body.url,
      userId: ctx.currentUser?.id ?? "anon",
      hasApiKey: Boolean(llmKey),
      model: model || "(default)",
    });
    publish(job, "status", "正在抓取字幕与关键帧…");
    const { transcript, strategy, cost } = await pipeline.run({
      url: body.url!,
      user: ctx.currentUser,
      signal: req.signal,
    });
    log.info("pipeline_ok", {
      strategy,
      cost,
      subtitleLines: transcript.subtitleLines,
      subtitleLang: transcript.subtitleLang,
      frames: transcript.frames.length,
    });
    if (cost > 0 && ctx.currentUser) {
      const balance = await ctx.services.credits.getBalance(ctx.currentUser.id);
      publish(job, "status", `已使用 ${strategy}，扣 ${cost} 积分（余额 ${balance}）`);
    } else {
      publish(job, "status", `已使用免费字幕（${transcript.subtitleLines} 行 · ${transcript.subtitleLang}）`);
    }
    if (transcript.frames.length === 0) {
      publish(job, "status", "无关键帧 sprite，已退化为纯字幕模式");
    }
    publish(job, "subtitle", transcript.subtitle);
    for await (const ev of ArticleAgent.run({
      transcript,
      llm,
      apiKey: llmKey,
      model,
      baseUrl,
      signal: req.signal,
    })) {
      if (ev.kind === "chunk") publish(job, "chunk", ev.text);
      else if (ev.kind === "status") publish(job, "status", ev.message);
      else if (ev.kind === "error") {
        publish(job, "error", ev.message);
        break;
      }
    }
  } catch (e) {
    log.error("pipeline_fail", {
      error: e instanceof Error ? e.message : String(e),
      name: e instanceof Error ? e.name : "unknown",
    });
    if (e instanceof InsufficientCreditsError) {
      publish(job, "error", JSON.stringify({
        code: "credits_insufficient",
        required: e.required,
        balance: e.balance,
      }));
    } else if (e instanceof AuthRequiredError) {
      publish(job, "error", JSON.stringify({
        code: "auth_required",
        reason: e.reason,
        estCost: e.estCost,
      }));
    } else {
      publish(job, "error", e instanceof Error ? e.message : String(e));
    }
  } finally {
    publish(job, "done", "");
  }
}

function pickServerKey(ctx: { config: { geminiApiKey: string; deepseekApiKey: string } }, llmId: string): string {
  if (llmId === "gemini") return ctx.config.geminiApiKey;
  if (llmId === "deepseek") return ctx.config.deepseekApiKey;
  return "";
}
