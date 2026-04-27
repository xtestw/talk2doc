// 给 FallbackStrategy 套一层"先扣分→跑→失败回滚"装饰。
// 让 runWithFallback 仍然只关心成功/失败语义，扣分逻辑解耦在装饰器里。
//
// 用法：
//   const billed = withBilledStrategy(PaidAsrStrategy, {
//     estimateCost: (ctx) => pricing.asrCostCredits(ctx.estDurationSec),
//     charge: async (ctx, amount, refId) => credits.charge(ctx.user.id, amount, "asr", refId),
//     refund: async (ctx, amount, refId) => credits.refund(ctx.user.id, amount, "asr_refund", refId),
//   });

import type { FallbackStrategy } from "./fallback";
import { newId } from "../utils/id";

export interface BillingHooks<TCtx> {
  /** 估算需扣多少积分（>0）。 */
  estimateCost(ctx: TCtx): Promise<number> | number;
  /** 真正的扣分动作。失败（包括余额不足）应抛错，由 runWithFallback 的 fatal 钩子外抛。 */
  charge(ctx: TCtx, amount: number, refId: string): Promise<void>;
  /** 退分。strategy 抛错或返回 null 时调用；本身失败要静默吞掉，避免遮蔽原始错误。 */
  refund(ctx: TCtx, amount: number, refId: string): Promise<void>;
  /** 钩点：策略真正成功后回调，便于上层把扣分量塞进 status 事件。可选。 */
  onCharged?(ctx: TCtx, amount: number, refId: string): void;
}

export function withBilledStrategy<TCtx, TResult>(
  inner: FallbackStrategy<TCtx, TResult>,
  hooks: BillingHooks<TCtx>,
): FallbackStrategy<TCtx, TResult> {
  return {
    id: `billed(${inner.id})`,
    async run(ctx) {
      const cost = await hooks.estimateCost(ctx);
      const refId = newId();
      // 余额不足时 charge 会抛 InsufficientCreditsError；外层用 fatal 钩子让它直接冒到 HTTP 层（402）
      await hooks.charge(ctx, cost, refId);

      try {
        const out = await inner.run(ctx);
        if (out == null) {
          await hooks.refund(ctx, cost, refId).catch(() => {});
          return null;
        }
        hooks.onCharged?.(ctx, cost, refId);
        return out;
      } catch (e) {
        await hooks.refund(ctx, cost, refId).catch(() => {});
        throw e;
      }
    },
  };
}
