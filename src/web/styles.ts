// 内联样式：杂志体阅读 + 字符级流式呈现，零依赖框架。
// 与登录态、充值弹窗、视图切换的样式一并放在这里，避免到处散落。

export const STYLES = /* css */ `
  :root {
    --bg: #f7f4ec;
    --surface: #ffffff;
    --surface-2: #f3ecdd;
    --ink: #1e1a16;
    --ink-soft: #544c43;
    --ink-mute: #7d756c;
    --rule: #ddd3c1;
    --accent: #b45133;
    --accent-soft: #f6e9e1;
    --warn: #c25c2e;
    --shadow: 0 1px 3px rgba(22, 20, 16, .06), 0 16px 46px rgba(22, 20, 16, .10);
    --shadow-soft: 0 8px 28px rgba(22, 20, 16, .08);
    --radius: 14px;
    --maxw: 780px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #12100d;
      --surface: #1b1814;
      --surface-2: #231d16;
      --ink: #f3efe8;
      --ink-soft: #c7b9a8;
      --ink-mute: #9a8c7a;
      --rule: #312920;
      --accent: #ee8f6f;
      --accent-soft: #32231d;
      --warn: #f09869;
      --shadow: 0 1px 3px rgba(0,0,0,.45), 0 16px 48px rgba(0,0,0,.45);
      --shadow-soft: 0 10px 28px rgba(0,0,0,.4);
    }
  }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB",
      "Microsoft YaHei", "Helvetica Neue", Helvetica, "Segoe UI", sans-serif;
    font-size: 17px;
    line-height: 1.75;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }
  main {
    position: relative;
  }
  main::before {
    content: "";
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: min(var(--maxw), calc(100% - 40px));
    height: 210px;
    border-radius: 18px;
    background:
      radial-gradient(120% 100% at 0% 0%, color-mix(in srgb, var(--accent-soft) 85%, transparent), transparent 60%),
      linear-gradient(180deg, color-mix(in srgb, var(--surface) 92%, transparent), transparent);
    pointer-events: none;
    z-index: 0;
  }
  .compose, .status, .meta, .viewbar, article {
    position: relative;
    z-index: 1;
  }

  .topbar {
    position: sticky; top: 0; z-index: 10;
    backdrop-filter: saturate(180%) blur(14px);
    -webkit-backdrop-filter: saturate(180%) blur(14px);
    background: color-mix(in srgb, var(--bg) 80%, transparent);
    border-bottom: 1px solid var(--rule);
  }
  .topbar-inner {
    max-width: var(--maxw); margin: 0 auto;
    padding: 12px 20px;
    display: flex; align-items: center; gap: 12px;
  }
  .brand {
    display: inline-flex; align-items: center; gap: 2px;
    font-weight: 700; letter-spacing: .02em; font-size: 15px; color: var(--ink);
  }
  .brand .dot { color: var(--accent); line-height: 1; }
  .brand-sub { color: var(--ink-mute); font-size: 13px; font-weight: 400; margin-left: 4px; }
  .spacer { flex: 1; }
  .ghost-btn {
    background: transparent; border: 0; color: var(--ink-mute);
    font: inherit; font-size: 13px; cursor: pointer; padding: 4px 8px; border-radius: 6px;
  }
  .ghost-btn:hover { background: var(--rule); color: var(--ink); }

  /* 登录区 */
  .auth-area { display: flex; align-items: center; gap: 8px; }
  #auth-authed:not([hidden]) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .credits-pill {
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--accent-soft); color: var(--accent);
    border-radius: 999px; padding: 0 10px; font-size: 12px;
    height: 28px;
    border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--rule));
    font-weight: 600;
    cursor: pointer; transition: filter .15s ease;
  }
  .credits-pill:hover { filter: brightness(0.95); }
  .credits-pill .icon {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, #fff, color-mix(in srgb, var(--accent) 85%, #fff) 55%, var(--accent));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 35%, var(--rule));
    flex: 0 0 auto;
  }
  .avatar {
    width: 28px; height: 28px; border-radius: 50%;
    background: var(--surface-2); border: 1px solid var(--rule);
    object-fit: cover;
    display: block;
  }
  .avatar-btn {
    border: 0;
    background: transparent;
    cursor: pointer;
    padding: 0;
    margin: 0;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .signin-btn {
    border: 1px solid var(--rule); background: var(--surface);
    color: var(--ink); font: inherit; font-size: 13px; font-weight: 600;
    border-radius: 8px; padding: 6px 12px; cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
    transition: border-color .15s, color .15s;
  }
  .signin-btn:hover { border-color: var(--accent); color: var(--accent); }
  .signin-btn .g {
    display: inline-block; width: 14px; height: 14px;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><path fill='%234285F4' d='M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.5 2.4 30.1 0 24 0 14.6 0 6.4 5.4 2.4 13.3l7.8 6c1.9-5.7 7.3-9.8 13.8-9.8z'/><path fill='%2334A853' d='M46.5 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.6c-.5 2.7-2.1 5-4.5 6.6l7 5.4c4.1-3.8 6.4-9.4 6.4-16.3z'/><path fill='%23FBBC05' d='M10.2 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C.9 16.6 0 20.2 0 24s.9 7.4 2.4 10.7l7.8-6z'/><path fill='%23EA4335' d='M24 48c6.5 0 11.9-2.1 15.9-5.8l-7-5.4c-2 1.4-4.6 2.2-8.9 2.2-6.5 0-12-4.1-13.9-9.8l-7.8 6C6.4 42.6 14.6 48 24 48z'/></svg>");
    background-size: contain; background-repeat: no-repeat;
  }
  .menu-anchor { position: relative; }
  .menu {
    position: absolute; right: 0; top: calc(100% + 6px);
    min-width: 220px;
    background: var(--surface); border: 1px solid var(--rule); border-radius: 10px;
    box-shadow: var(--shadow); padding: 8px; z-index: 20;
    display: none;
  }
  .menu.open { display: block; }
  .menu .row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; }
  .menu .row.head { color: var(--ink-mute); font-size: 12px; }
  .menu .row.head img { width: 28px; height: 28px; }
  .menu .row strong { display: block; font-size: 13px; color: var(--ink); }
  .menu .row span { font-size: 12px; color: var(--ink-mute); }
  .menu hr { border: 0; border-top: 1px solid var(--rule); margin: 6px 0; }
  .menu button {
    width: 100%; text-align: left; background: transparent; border: 0;
    font: inherit; font-size: 13px; padding: 8px 10px; border-radius: 8px;
    color: var(--ink); cursor: pointer;
  }
  .menu button:hover { background: var(--surface-2); }

  .compose { max-width: var(--maxw); margin: 24px auto 10px; padding: 0; }
  .hero-card {
    padding: 18px;
    border-radius: 16px;
    border: 1px solid color-mix(in srgb, var(--rule) 70%, transparent);
    background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 94%, transparent), color-mix(in srgb, var(--surface-2) 55%, var(--surface)));
    box-shadow: var(--shadow);
  }
  .hero-head { margin-bottom: 12px; }
  .hero-title {
    margin: 0;
    font-size: 24px;
    line-height: 1.3;
    letter-spacing: -0.01em;
  }
  .hero-subtitle {
    margin: 6px 0 0;
    color: var(--ink-mute);
    font-size: 13px;
    line-height: 1.6;
  }
  .input-row {
    display: flex; gap: 8px; align-items: stretch;
    background: var(--surface); border: 1px solid var(--rule); border-radius: var(--radius);
    box-shadow: var(--shadow); padding: 8px;
    transition: box-shadow .2s ease, border-color .2s ease, transform .2s ease;
  }
  .input-row:focus-within {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--rule));
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-soft) 65%, transparent), var(--shadow);
    transform: translateY(-1px);
  }
  .input-row input[type="url"] {
    flex: 1; min-width: 0;
    background: transparent; border: 0; outline: 0;
    color: var(--ink); font: inherit; font-size: 16px;
    padding: 12px 14px;
  }
  .input-row input::placeholder { color: var(--ink-mute); }
  .input-row input[type="url"]:disabled {
    color: var(--ink-mute);
    cursor: not-allowed;
  }
  .primary {
    border: 0;
    background: linear-gradient(180deg, color-mix(in srgb, var(--ink) 92%, #000), var(--ink));
    color: var(--bg);
    font: inherit; font-weight: 600; font-size: 14px;
    padding: 0 20px; border-radius: 10px; cursor: pointer;
    transition: opacity .15s ease, background .15s ease;
    min-width: 96px;
  }
  .primary:hover:not(:disabled) {
    opacity: .92;
    transform: translateY(-1px);
    box-shadow: 0 10px 24px color-mix(in srgb, var(--ink) 25%, transparent);
  }
  .primary:disabled { opacity: .55; cursor: progress; }
  .primary.stop { background: var(--accent); }
  .primary:focus-visible,
  .ghost-btn:focus-visible,
  .signin-btn:focus-visible,
  .tab-btn:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent) 70%, #fff);
    outline-offset: 2px;
  }

  .model-switch {
    margin: 12px 0 0;
    padding: 0;
    border: 0;
    display: inline-flex;
    gap: 10px;
    background: color-mix(in srgb, var(--surface) 92%, var(--surface-2));
    border: 1px solid var(--rule);
    border-radius: 999px;
    padding: 6px;
    box-shadow: var(--shadow-soft);
  }
  .model-switch.disabled {
    opacity: .62;
    filter: grayscale(.2);
    pointer-events: none;
  }
  .model-option {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--ink-soft);
    cursor: pointer;
    padding: 6px 12px;
    border-radius: 999px;
    transition: background .15s ease, color .15s ease;
  }
  .model-option:has(input:checked) {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 25%, transparent);
  }
  .model-option input[type="radio"] {
    margin: 0;
    accent-color: var(--accent);
    width: 14px;
    height: 14px;
  }
  .hint { color: var(--ink-mute); font-size: 12px; margin-top: 8px; padding: 0 2px; }
  .hint a { color: var(--accent); text-decoration: none; }
  .hint a:hover { text-decoration: underline; }

  .toast {
    position: fixed; left: 50%; top: 16px; transform: translateX(-50%) translateY(-200%);
    background: var(--accent); color: #fff;
    padding: 10px 16px; border-radius: 999px; font-size: 14px;
    box-shadow: var(--shadow); transition: transform .3s ease;
    max-width: calc(100vw - 32px); z-index: 50;
  }
  .toast.show { transform: translateX(-50%) translateY(0); }

  .status {
    max-width: var(--maxw); margin: 18px auto 0;
    padding: 0 20px; color: var(--ink-mute); font-size: 13px;
    display: flex; align-items: center; gap: 8px; min-height: 18px;
  }
  .status.busy::before {
    content: ""; width: 8px; height: 8px; border-radius: 50%;
    background: var(--accent); animation: pulse 1.2s infinite ease-in-out;
  }
  @keyframes pulse {
    0%, 100% { opacity: .35; transform: scale(.85); }
    50% { opacity: 1; transform: scale(1); }
  }
  .meta {
    max-width: var(--maxw); margin: 8px auto 0; padding: 0 20px;
    display: flex; justify-content: space-between; gap: 10px; align-items: center;
    color: var(--ink-mute); font-size: 12px; min-height: 18px;
  }
  .meta .left, .meta .right { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .chip {
    background: color-mix(in srgb, var(--accent-soft) 65%, transparent);
    color: var(--ink-soft); border: 1px solid var(--rule); border-radius: 999px;
    padding: 2px 8px; font-size: 12px;
  }
  .viewbar {
    max-width: var(--maxw); margin: 12px auto 0; padding: 0 20px;
    display: flex; gap: 8px; align-items: center; justify-content: space-between;
  }
  .view-tabs {
    display: inline-flex; gap: 4px; background: var(--surface);
    border: 1px solid var(--rule); border-radius: 10px; padding: 4px;
    box-shadow: var(--shadow-soft);
  }
  .tab-btn {
    border: 0; background: transparent; color: var(--ink-mute);
    padding: 6px 10px; border-radius: 8px; font-size: 12px; cursor: pointer;
  }
  .tab-btn.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
  .tab-btn:disabled { opacity: .5; cursor: not-allowed; }
  .secondary {
    border: 1px solid var(--rule); background: var(--surface); color: var(--ink-soft);
    font: inherit; font-size: 12px; border-radius: 8px; padding: 6px 10px; cursor: pointer;
  }
  .secondary:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }

  /* 充值弹窗 */
  .modal-mask {
    position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 40;
    display: none; align-items: center; justify-content: center;
    backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  }
  .modal-mask.open { display: flex; }
  .modal {
    width: min(440px, calc(100vw - 32px));
    background: var(--surface); border: 1px solid var(--rule); border-radius: 14px;
    padding: 24px; box-shadow: var(--shadow);
  }
  .modal h2 { margin: 0 0 4px; font-size: 18px; }
  .modal .lead { color: var(--ink-mute); font-size: 13px; margin-bottom: 16px; }
  .warn-banner {
    border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--rule));
    background: color-mix(in srgb, var(--warn) 12%, var(--surface));
    border-radius: 10px;
    padding: 10px 12px;
    margin-bottom: 12px;
    display: grid;
    gap: 4px;
  }
  .warn-banner strong { color: var(--warn); font-size: 13px; }
  .warn-banner span { color: var(--ink-soft); font-size: 12px; }
  .pkg-list { display: flex; flex-direction: column; gap: 10px; }
  .pkg {
    display: flex; align-items: center; justify-content: space-between;
    background: var(--surface-2); border: 1px solid var(--rule); border-radius: 10px;
    padding: 14px 16px; cursor: pointer; transition: border-color .15s;
  }
  .pkg:hover { border-color: var(--accent); }
  .pkg.disabled { cursor: not-allowed; opacity: .72; }
  .pkg.disabled:hover { border-color: var(--rule); }
  .pkg .l strong { display: block; font-size: 14px; }
  .pkg .l span { color: var(--ink-mute); font-size: 12px; }
  .pkg .r {
    color: var(--accent); font-weight: 700; font-size: 16px;
    display: flex; flex-direction: column; align-items: flex-end;
  }
  .pkg .r small { color: var(--ink-mute); font-weight: 400; font-size: 11px; }
  .modal .footer { margin-top: 16px; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .modal .footer .hint { margin: 0; }
  .modal .close {
    border: 1px solid var(--rule); background: transparent; color: var(--ink-soft);
    padding: 8px 14px; border-radius: 8px; font: inherit; cursor: pointer;
  }

  /* 文章排版 */
  article {
    max-width: var(--maxw); margin: 20px auto 96px;
    padding: 18px 20px 0;
    color: var(--ink);
    background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 96%, transparent), color-mix(in srgb, var(--surface) 88%, var(--surface-2)));
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--rule) 75%, transparent);
    box-shadow: var(--shadow-soft);
  }
  article.empty::before {
    content: "在上面贴一个有字幕的 YouTube 对话视频链接，按下「生成」。";
    display: block; color: var(--ink-mute); font-size: 14px;
    padding: 56px 0; text-align: center; border-top: 1px dashed var(--rule);
  }

  article h1 {
    font-size: 32px; line-height: 1.32; font-weight: 800;
    letter-spacing: -.005em; margin: 8px 0 28px; color: var(--ink);
  }
  article h2 {
    font-size: 22px; line-height: 1.4; font-weight: 700;
    margin: 56px 0 20px; padding-left: 14px;
    border-left: 4px solid var(--accent);
    color: var(--ink);
    background: linear-gradient(90deg, color-mix(in srgb, var(--accent-soft) 55%, transparent), transparent 72%);
  }
  article h3 {
    font-size: 17px; line-height: 1.5; font-weight: 700;
    margin: 32px 0 14px; color: var(--ink-soft);
    padding-bottom: 6px; border-bottom: 1px solid var(--rule);
  }
  article p + p {
    text-wrap: pretty;
  }
  article p { margin: 15px 0; color: var(--ink); }
  article p:has(> strong:first-child) {
    padding: 8px 0 8px 14px;
    border-left: 2px solid var(--rule);
    background: color-mix(in srgb, var(--surface-2) 32%, transparent);
    border-radius: 0 8px 8px 0;
  }
  article p > strong:first-child {
    color: var(--accent); margin-right: 4px;
    font-weight: 700; letter-spacing: .01em;
  }
  article p:has(> strong:first-child) + p:not(:has(> strong:first-child)) {
    padding-left: 14px; border-left: 2px solid var(--rule); margin-top: 6px;
  }
  article ul, article ol { padding-left: 1.4em; }
  article li { margin: 6px 0; }
  article strong { font-weight: 700; }
  article em { font-style: italic; color: var(--ink-soft); }
  article hr { border: 0; border-top: 1px solid var(--rule); margin: 40px auto; width: 80px; }
  article a { color: var(--accent); text-decoration: none; border-bottom: 1px dashed currentColor; }
  article a:hover { color: color-mix(in srgb, var(--accent) 85%, var(--ink)); }

  article.streaming > *:last-child::after {
    content: "▍"; margin-left: 2px; color: var(--accent);
    animation: blink 1s steps(2, start) infinite; font-weight: 400;
  }
  @keyframes blink { to { visibility: hidden; } }

  @media (max-width: 700px) {
    main::before {
      width: calc(100% - 28px);
      height: 170px;
      border-radius: 14px;
    }
    .hero-card { padding: 14px; }
    .hero-title { font-size: 20px; }
    .topbar-inner { padding: 10px 14px; }
    .brand-sub { display: none; }
    .compose { padding: 0; }
    .status, .meta, .viewbar { padding: 0 14px; }
    .viewbar { overflow-x: auto; }
    article { padding: 14px 14px 0; margin-top: 16px; }
  }

  @media (max-width: 540px) {
    body { font-size: 16px; }
    .input-row { flex-direction: column; padding: 10px; }
    .primary { min-height: 42px; }
    .hero-subtitle { font-size: 12px; }
    article h1 { font-size: 26px; }
    article h2 { font-size: 20px; }
    .model-switch {
      width: 100%;
      justify-content: space-between;
    }
    .model-option {
      flex: 1;
      justify-content: center;
    }
    .view-tabs { width: 100%; }
    .tab-btn { flex: 1; text-align: center; }
  }
`;
