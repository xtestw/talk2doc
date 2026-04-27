// 单一定价表。改价、加套餐只动这里 + wrangler.toml 的 TOPUP_PACKAGES_JSON。

import type { AppConfig, TopupPackage } from "../infra/config";

export class Pricing {
  constructor(private readonly cfg: AppConfig) {}

  /** ASR 单次费用：每分钟 N 积分（向上取整，最少 1 分）。 */
  asrCostCredits(durationSec: number): number {
    const sec = Math.max(0, Math.floor(durationSec || 0));
    const minutes = Math.ceil(sec / 60);
    return Math.max(1, minutes * this.cfg.pricingPerMinuteCredits);
  }

  topupPackages(): TopupPackage[] {
    return this.cfg.topupPackages;
  }

  findPackage(id: string): TopupPackage | null {
    return this.cfg.topupPackages.find((p) => p.id === id) ?? null;
  }

  signupBonus(): number {
    return this.cfg.signupBonusCredits;
  }
}
