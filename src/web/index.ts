// 把 styles / auth bar / billing modal / app 脚本组装成单页 HTML，供 Worker 入口直接吐出。
//
// 之所以拼字符串而不打包 SPA：
//   · Worker 体积敏感，省去 vite/rollup
//   · 我们要求"零依赖"心智，前端只是 progressive enhancement
//   · marked.js 通过 CDN 引入，离线/挂掉时有本地 fallback（见 app.ts）

import { APP_SCRIPT } from "./app";
import { AUTH_BAR_HTML, AUTH_REQUIRED_MODAL_HTML, SUBTITLE_FAILED_MODAL_HTML } from "./auth";
import { BILLING_MODAL_HTML } from "./billing";
import { STYLES } from "./styles";

const HEAD = /* html */ `
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>Talk2Doc · YouTube 视频对话化文章</title>
<meta name="description" content="贴一个有字幕的 YouTube 视频，自动生成中文对话文章。" />
<meta name="theme-color" content="#fbfaf6" />
<link rel="icon" href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='26' font-size='28'>🗒️</text></svg>" />
<style>${STYLES}</style>
<script src="https://cdn.jsdelivr.net/npm/marked@13.0.3/marked.min.js" defer crossorigin="anonymous"></script>
`;

const BODY = /* html */ `
<header class="topbar">
  <div class="topbar-inner">
    <div class="brand">Talk2Doc<span class="dot"></span><span class="brand-sub">把对话变成可读文本</span></div>
    <div class="spacer"></div>
    <a class="ghost-btn" href="/orders">历史记录</a>
    ${AUTH_BAR_HTML}
  </div>
</header>

<main>
  <form id="form" class="compose" autocomplete="off">
    <div class="hero-card">
      <div class="hero-head">
        <h1 class="hero-title">把 YouTube 对话变成好读文章</h1>
        <p class="hero-subtitle">支持 Gemini / DeepSeek，一键生成中文文章。</p>
      </div>
      <div class="input-row">
        <input id="url" type="url" list="recent-url-list" required placeholder="粘贴一个有字幕的 YouTube 链接，例如 https://youtube.com/watch?v=..." />
        <datalist id="recent-url-list"></datalist>
        <button id="submit" type="submit" class="primary">生成</button>
      </div>
      <fieldset class="model-switch" aria-label="模型选择">
        <label class="model-option">
          <input type="radio" name="provider" value="gemini" checked />
          <span>Gemini</span>
        </label>
        <label class="model-option">
          <input type="radio" name="provider" value="deepseek" />
          <span>DeepSeek</span>
        </label>
      </fieldset>
      <p class="hint">未登录也可直接生成（有可用字幕时）；无足够字幕并需转写时，会提示先登录。登录首登赠送积分，积分用于付费 ASR。</p>
    </div>
  </form>

  <div id="status" class="status">
    <span id="status-text" aria-live="polite"></span>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button id="download-subtitle" class="secondary" type="button" hidden>下载字幕</button>
      <button id="download-md" class="secondary" type="button" hidden>下载 MD</button>
      <button id="download-html" class="secondary" type="button" hidden>下载 HTML</button>
      <button id="download-pdf" class="secondary" type="button" hidden>下载 PDF</button>
    </div>
  </div>
  <div id="meta" class="meta"></div>
  <article id="article-publish" class="empty"></article>
</main>

${BILLING_MODAL_HTML}
${AUTH_REQUIRED_MODAL_HTML}
${SUBTITLE_FAILED_MODAL_HTML}

<div id="toast" class="toast" role="status"></div>

<script>${APP_SCRIPT}</script>
`;

export const INDEX_HTML = `<!doctype html>
<html lang="zh-CN">
<head>${HEAD}</head>
<body>${BODY}</body>
</html>`;
