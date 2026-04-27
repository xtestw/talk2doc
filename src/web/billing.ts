// 充值弹窗（mask + modal）。骨架渲染在加载时，套餐通过 /api/pricing 异步填充。

export const BILLING_MODAL_HTML = /* html */ `
<div id="topup-mask" class="modal-mask" role="dialog" aria-modal="true" aria-labelledby="topup-title">
  <div class="modal">
    <h2 id="topup-title">为账户充值</h2>
    <p class="lead">积分用于付费 ASR、模型用量等。1 积分 ≈ 1 分钟 ASR。</p>
    <div id="topup-unavailable" class="warn-banner" hidden>
      <strong>支付能力暂不可用</strong>
      <span id="topup-unavailable-reason">未配置 STRIPE_SECRET_KEY，当前仅可查看套餐，暂不能发起支付。</span>
    </div>
    <div id="topup-list" class="pkg-list">
      <div class="pkg" style="opacity:.6;cursor:default;">
        <div class="l"><strong>加载中…</strong><span>正在拉取套餐</span></div>
        <div class="r">…</div>
      </div>
    </div>
    <div class="footer">
      <p class="hint">支付由 Stripe 处理，我们不存留卡信息。</p>
      <button id="topup-close" class="close" type="button">关闭</button>
    </div>
  </div>
</div>
`;
