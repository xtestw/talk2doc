// 通用兜底执行器：A/B/C 策略按序尝试，命中即返回。
// 适用于 transcript 抽取、speaker 识别、LLM 路由等场景。
//
// fatal 钩子：让某些错误（如 InsufficientCreditsError）直接外抛，
// 不被吞进 errors 列表里继续尝试，把"业务级硬错"和"技术级可重试错"分清楚。

export interface FallbackStrategy<TCtx, TResult> {
  id: string;
  run(ctx: TCtx): Promise<TResult | null>;
}

export interface FallbackResult<TResult> {
  result: TResult | null;
  tried: string[];
  errors: string[];
}

export interface FallbackOptions<TResult> {
  /** 拿到 result 后再做一次门槛校验，不通过视为该策略失败。 */
  accept?: (v: TResult) => boolean;
  /** 返回 true 的错误直接外抛，不再尝试后续策略。 */
  fatal?: (e: unknown) => boolean;
}

export async function runWithFallback<TCtx, TResult>(
  ctx: TCtx,
  strategies: Array<FallbackStrategy<TCtx, TResult>>,
  opts?: FallbackOptions<TResult>,
): Promise<FallbackResult<TResult>> {
  const tried: string[] = [];
  const errors: string[] = [];
  const accept = opts?.accept ?? (() => true);
  const isFatal = opts?.fatal ?? (() => false);

  for (const s of strategies) {
    tried.push(s.id);
    try {
      const out = await s.run(ctx);
      if (out && accept(out)) return { result: out, tried, errors };
      errors.push(`${s.id}: empty_or_rejected`);
    } catch (e) {
      if (isFatal(e)) throw e;
      errors.push(`${s.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { result: null, tried, errors };
}
