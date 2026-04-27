// 把 styles / auth bar / billing modal / app 脚本组装成单页 HTML，供 Worker 入口直接吐出。
//
// 之所以拼字符串而不打包 SPA：
//   · Worker 体积敏感，省去 vite/rollup
//   · 我们要求"零依赖"心智，前端只是 progressive enhancement
//   · marked.js 通过 CDN 引入，离线/挂掉时有本地 fallback（见 app.ts）

import { APP_SCRIPT } from "./app";
import { AUTH_BAR_HTML, AUTH_REQUIRED_MODAL_HTML } from "./auth";
import { BILLING_MODAL_HTML } from "./billing";
import { STYLES } from "./styles";

const HEAD = /* html */ `
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>Talk2Doc · YouTube 视频对话化文章</title>
<meta name="description" content="贴一个有字幕的 YouTube 视频，自动生成可发布的中文对话文章。" />
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
    ${AUTH_BAR_HTML}
  </div>
</header>

<main>
  <form id="form" class="compose" autocomplete="off">
    <div class="hero-card">
      <div class="hero-head">
        <h1 class="hero-title">把 YouTube 对话变成好读文章</h1>
        <p class="hero-subtitle">支持 Gemini / DeepSeek，一键生成口播版与可发布版。</p>
      </div>
      <div class="input-row">
        <input id="url" type="url" required placeholder="粘贴一个有字幕的 YouTube 链接，例如 https://youtube.com/watch?v=..." />
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

  <div id="status" class="status" aria-live="polite"></div>
  <div id="meta" class="meta"></div>

  <div id="viewbar" class="viewbar">
    <div class="view-tabs" role="tablist">
      <button class="tab-btn active" data-view="all" type="button" role="tab">全部</button>
      <button class="tab-btn" data-view="a" type="button" role="tab">A 版（口播感）</button>
      <button class="tab-btn" data-view="b" type="button" role="tab" disabled>B 版（可发布）</button>
    </div>
  </div>

  <article id="article-all" class="empty"></article>
  <article id="article-a" hidden></article>
  <article id="article-b" hidden></article>
</main>

${BILLING_MODAL_HTML}
${AUTH_REQUIRED_MODAL_HTML}

<div id="toast" class="toast" role="status"></div>

<script>${APP_SCRIPT}</script>
`;

export const INDEX_HTML = `<!doctype html>
<html lang="zh-CN">
<head>${HEAD}</head>
<body>${BODY}</body>
</html>`;
