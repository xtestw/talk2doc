// 视频 → transcript 编排器（"上层业务编排 + 多方案兜底"主干）。
//
// 策略链：
//   1. YouTube 免费字幕（不扣分）
//   2. 付费 ASR（withBilledStrategy 装饰：先扣分→跑→失败回滚）
//
// 余额不足由 InsufficientCreditsError 外抛，HTTP 翻 402；
// 需付费 ASR 但匿名时由 AuthRequiredError 外抛，流式层翻 SSE error；
// 其他技术错由 runWithFallback 沿链尝试。

import { newId } from "../core/utils/id";
import {
  runWithFallback,
  type FallbackStrategy,
} from "../core/execution/fallback";
import { withBilledStrategy } from "../core/execution/billed-strategy";
import type { Logger } from "../core/utils/log";
import { logger as defaultLogger } from "../core/utils/log";

import { makeAsrTranscriptProvider } from "../infra/transcript/asr";
import { makeSubtitleProxyProvider } from "../infra/transcript/subtitle-proxy";
import type { TranscriptResult } from "../infra/transcript/types";
import { YouTubeProvider } from "../infra/transcript/youtube";
import type { AsrProvider } from "../infra/asr/types";

import type { Pricing } from "../domain/pricing";
import {
  CreditsService,
  InsufficientCreditsError,
} from "../domain/credits";
import { AuthRequiredError } from "../domain/errors";
import type { AsrJobsService } from "../domain/asr-jobs";
import type { User } from "../domain/types";

export interface VideoPipelineDeps {
  pricing: Pricing;
  credits: CreditsService;
  asrJobs: AsrJobsService;
  asr: AsrProvider | null;       // null 时表示当前部署未配 AI binding，跳过付费兜底
  subtitleProxyUrl: string;
  logger?: Logger;
}

export interface VideoPipelineInput {
  url: string;
  /** 仅免费字幕时可为 null；走付费 ASR 前会校验，未登录则抛 AuthRequiredError。 */
  user: User | null;
  signal?: AbortSignal;
}

export interface VideoPipelineOutput {
  transcript: TranscriptResult;
  /** 实际命中哪条策略：用于上层 status 事件（"使用免费字幕" / "使用付费 ASR，扣 N 积分"）。 */
  strategy: string;
  /** 走付费 ASR 时记录扣了多少积分；免费字幕为 0。 */
  cost: number;
  /** 关联的扣分流水/任务 id。 */
  refId: string | null;
}

interface PipelineCtx extends VideoPipelineInput {
  deps: VideoPipelineDeps;
  asrCost: number;
  asrJobId: string;
}

/** 经过 null 守卫确认后的收窄类型，供付费 ASR 策略的 hooks 使用，避免重复断言。 */
type AuthedPipelineCtx = PipelineCtx & { user: User };

/** 字幕至少要有 5 行才算可用，太少视为"没字幕"，触发 ASR 兜底。 */
const MIN_USABLE_SUBTITLE_LINES = 5;

export class VideoPipeline {
  constructor(private readonly deps: VideoPipelineDeps) {}

  async run(input: VideoPipelineInput): Promise<VideoPipelineOutput> {
    const log = (this.deps.logger ?? defaultLogger).with({
      component: "video-pipeline",
      url: input.url,
      userId: input.user?.id ?? "anon",
    });
    log.info("transcript_pipeline_start", {
      hasAsr: Boolean(this.deps.asr),
      userAuthed: Boolean(input.user),
      minSubtitleLines: MIN_USABLE_SUBTITLE_LINES,
    });

    // 估算 ASR 成本时按 8 分钟兜底（拉到 player 才精确，但提前估算用于余额预检即可）。
    // 真扣分时由 BilledStrategy 在 cf-whisper 之前重算。
    const estDur = 8 * 60;
    const asrCost = this.deps.pricing.asrCostCredits(estDur);
    const asrJobId = newId();

    const ctx: PipelineCtx = { ...input, deps: this.deps, asrCost, asrJobId };

    const strategies: Array<FallbackStrategy<PipelineCtx, VideoPipelineOutput>> = [
      this.youtubeCaptionStrategy(),
      this.subtitleProxyStrategy(),
    ];
    if (this.deps.asr) {
      strategies.push(this.paidAsrStrategy(this.deps.asr));
    }
    log.info("transcript_strategies_ready", {
      strategies: strategies.map((s) => s.id),
      estAsrCost: asrCost,
      asrJobId,
    });

    const { result, tried, errors } = await runWithFallback(ctx, strategies, {
      accept: (r) => r.transcript.subtitleLines >= MIN_USABLE_SUBTITLE_LINES,
      fatal: (e) =>
        e instanceof InsufficientCreditsError ||
        e instanceof AuthRequiredError,
    });

    if (!result) {
      log.warn("transcript_fallback_exhausted", { tried, errors });
      throw new Error(`抽不到字幕：${errors.join(" | ") || "all_strategies_failed"}`);
    }

    log.info("transcript_done", {
      strategy: result.strategy,
      cost: result.cost,
      subtitleLines: result.transcript.subtitleLines,
      subtitleLang: result.transcript.subtitleLang,
    });
    return result;
  }

  // ============= 策略 1：免费字幕 =============
  private youtubeCaptionStrategy(): FallbackStrategy<PipelineCtx, VideoPipelineOutput> {
    return {
      id: "youtube-caption",
      async run(ctx) {
        if (!YouTubeProvider.supports(ctx.url)) return null;
        const transcript = await YouTubeProvider.extract(ctx.url, { signal: ctx.signal });
        return {
          transcript,
          strategy: "youtube-caption",
          cost: 0,
          refId: null,
        };
      },
    };
  }

  // ============= 策略 2：subtitle-proxy 免费字幕 =============
  private subtitleProxyStrategy(): FallbackStrategy<PipelineCtx, VideoPipelineOutput> {
    return {
      id: "subtitle-proxy",
      async run(ctx) {
        const provider = makeSubtitleProxyProvider(ctx.deps.subtitleProxyUrl);
        if (!provider.supports(ctx.url)) return null;
        const transcript = await provider.extract(ctx.url, { signal: ctx.signal });
        return {
          transcript,
          strategy: "subtitle-proxy",
          cost: 0,
          refId: null,
        };
      },
    };
  }

  // ============= 策略 3：付费 ASR =============
  private paidAsrStrategy(asr: AsrProvider): FallbackStrategy<PipelineCtx, VideoPipelineOutput> {
    // inner + billed 均使用 AuthedPipelineCtx，hooks 内可安全访问 ctx.user（User，非 null）。
    const inner: FallbackStrategy<AuthedPipelineCtx, VideoPipelineOutput> = {
      id: `asr:${asr.id}`,
      async run(ctx) {
        const provider = makeAsrTranscriptProvider({ asr });
        const transcript = await provider.extract(ctx.url, { signal: ctx.signal });
        return {
          transcript,
          strategy: `asr:${asr.id}`,
          cost: ctx.asrCost,
          refId: ctx.asrJobId,
        };
      },
    };

    const billed = withBilledStrategy<AuthedPipelineCtx, VideoPipelineOutput>(inner, {
      estimateCost: (ctx) => ctx.asrCost,
      charge: async (ctx, amount, _refId) => {
        await ctx.deps.asrJobs.create({
          id: ctx.asrJobId,
          userId: ctx.user.id,
          sourceUrl: ctx.url,
          durationSec: null,
          costCredits: amount,
          provider: asr.id,
        });
        await ctx.deps.credits.charge(ctx.user.id, amount, "asr", ctx.asrJobId);
      },
      refund: async (ctx, amount, _refId) => {
        await ctx.deps.credits.refund(ctx.user.id, amount, "asr_refund", ctx.asrJobId);
        await ctx.deps.asrJobs.finish(ctx.asrJobId, "refunded");
      },
      onCharged: (ctx) => {
        void ctx.deps.asrJobs.finish(ctx.asrJobId, "success").catch(() => {});
      },
    });

    // 外层 wrapper：在 user 为 null（匿名）时抛 AuthRequiredError（fatal），
    // 有 user 时将 ctx 收窄为 AuthedPipelineCtx，仅此一处断言。
    return {
      id: billed.id,
      async run(ctx) {
        if (!ctx.user) throw new AuthRequiredError("asr_needed", ctx.asrCost);
        return billed.run(ctx as AuthedPipelineCtx);
      },
    };
  }
}
