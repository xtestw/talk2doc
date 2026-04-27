// 与领域规则相关的、可在 HTTP/流式层翻译为 4xx 的致命错误（非每模块各自散落）。

/**
 * 需要走付费 ASR 但当前请求未带登录态（如匿名用户、会话过期）。
 * 与 InsufficientCreditsError 区分：前者需登录，后者是已登录但积分不足。
 */
export class AuthRequiredError extends Error {
  readonly code = "auth_required";

  constructor(
    /** 机器可读子原因，如 "asr_needed" */
    readonly reason: string,
    /** 粗估的 ASR 积分数，用于弹窗说明（与真扣费可能因时长不同有偏差） */
    readonly estCost: number,
  ) {
    super(`auth required: ${reason} (estCost=${estCost})`);
    this.name = "AuthRequiredError";
  }
}
