// GET /api/pricing → 套餐列表 + ASR 单价
// 公开端点，未登录也能看，用于充值弹窗渲染。

import { json } from "../respond";
import type { Handler } from "../router";

export const list: Handler = async (_req, ctx) => {
  return json({
    asr: {
      perMinuteCredits: ctx.config.pricingPerMinuteCredits,
      example1Min: ctx.services.pricing.asrCostCredits(60),
      example10Min: ctx.services.pricing.asrCostCredits(600),
    },
    signupBonus: ctx.config.signupBonusCredits,
    packages: ctx.services.pricing.topupPackages(),
    billing: {
      stripeEnabled: Boolean(ctx.config.stripeSecretKey),
      stripeUnavailableReason: ctx.config.stripeSecretKey ? "" : "未配置 STRIPE_SECRET_KEY",
    },
  });
};
