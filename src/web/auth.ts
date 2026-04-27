// 顶栏鉴权区：未登录显示 Sign in with Google；已登录显示头像 + 余额胶囊 + 下拉菜单。
// 这里只渲染骨架；真实的 JS 交互（拉 /api/auth/me、登出、点充值打开弹窗）在 app.ts 里统一接。

export const AUTH_BAR_HTML = /* html */ `
<div class="auth-area">
  <div id="auth-anonymous" hidden>
    <a class="signin-btn" href="/api/auth/google/start" title="使用 Google 登录">
      <span class="g" aria-hidden="true"></span>
      <span>Sign in with Google</span>
    </a>
  </div>
  <div id="auth-authed" class="menu-anchor" hidden>
    <button id="credits-btn" class="credits-pill" type="button" title="点击充值积分">
      <span class="icon" aria-hidden="true"></span>
      <span id="credits-num">—</span>
    </button>
    <button id="user-btn" class="avatar-btn" type="button" aria-haspopup="menu" aria-expanded="false">
      <img id="user-avatar" class="avatar" alt="" />
    </button>
    <div id="user-menu" class="menu" role="menu">
      <div class="row head">
        <img id="menu-avatar" class="avatar" alt="" />
        <div>
          <strong id="menu-name">—</strong>
          <span id="menu-email">—</span>
        </div>
      </div>
      <hr />
      <div class="row" style="padding:6px 10px;">
        <span style="color:var(--ink-mute);font-size:12px;">余额</span>
        <strong id="menu-credits" style="margin-left:auto;color:var(--accent);">—</strong>
      </div>
      <button id="menu-topup" type="button">充值积分</button>
      <button id="menu-history" type="button">查看账单</button>
      <hr />
      <button id="menu-logout" type="button">退出登录</button>
    </div>
  </div>
</div>
`;

/** 无字幕需走 ASR 时，引导匿名用户登录（不自动跳转，需用户确认）。 */
export const AUTH_REQUIRED_MODAL_HTML = /* html */ `
<div id="auth-mask" class="modal-mask" role="dialog" aria-modal="true" aria-labelledby="auth-title">
  <div class="modal">
    <h2 id="auth-title">需要登录以使用转写</h2>
    <p class="lead">该链接暂无足够可用字幕。登录后可使用付费转写（Whisper），约消耗 <strong id="auth-estcost">—</strong> 积分。</p>
    <div class="footer" style="margin-top:20px;">
      <button id="auth-cancel" class="close" type="button">稍后再说</button>
      <a id="auth-login" class="signin-btn" href="/api/auth/google/start" title="使用 Google 登录">
        <span class="g" aria-hidden="true"></span>
        <span>使用 Google 登录</span>
      </a>
    </div>
  </div>
</div>
`;
