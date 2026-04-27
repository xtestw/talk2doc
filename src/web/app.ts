// 前端运行时脚本（以字符串内联回 HTML）。
//
// 关注点拆分（同一文件内的逻辑分组）：
//   · 状态：me / pricing / streaming
//   · UI：auth bar 渲染、菜单、Toast、Modal
//   · 生成：SSE 解析 + rAF 节奏 + 双版本拆分（A 版/B 版/全部 view）
//   · 鉴权/计费：SSE/HTTP 内 auth_required 弹登录，credits_insufficient 弹充值
//
// 不引第三方框架；marked.js 通过 CDN 引（兜底用极简 fallback）。

export const APP_SCRIPT = /* javascript */ `
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const enc = (s) => String(s ?? "");
  const fmt = (n) => Number(n || 0).toLocaleString();

  // ---------- Toast ----------
  const toast = $("#toast");
  let toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
  }

  // ---------- LocalStorage settings (LLM 配置 + 视图模式) ----------
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  // ---------- Auth ----------
  let me = null; // { id, email, name, picture, credits } | null

  async function refreshMe() {
    try {
      const r = await fetch("/api/auth/me", { credentials: "include" });
      const j = await r.json();
      me = j.user || null;
    } catch { me = null; }
    renderAuth();
  }

  function renderAuth() {
    const anon = $("#auth-anonymous");
    const authed = $("#auth-authed");
    if (!me) {
      anon.hidden = false; authed.hidden = true;
      return;
    }
    anon.hidden = true; authed.hidden = false;
    $("#credits-num").textContent = fmt(me.credits);
    const av = me.picture || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='16' fill='%23ddd'/></svg>";
    $("#user-avatar").src = av;
    $("#menu-avatar").src = av;
    $("#menu-name").textContent = me.name || "—";
    $("#menu-email").textContent = me.email || "—";
    $("#menu-credits").textContent = fmt(me.credits);
  }

  function ensureLoggedIn() {
    if (me) return true;
    showToast("请先登录");
    location.href = "/api/auth/google/start";
    return false;
  }

  function openAuthRequiredModal(_reason, estCost) {
    const v = (estCost != null && estCost !== "") ? String(estCost) : "—";
    const n = $("#auth-estcost");
    if (n) n.textContent = v;
    $("#auth-mask")?.classList.add("open");
  }
  function closeAuthRequired() { $("#auth-mask")?.classList.remove("open"); }

  // ---------- Menu ----------
  function bindMenu() {
    const btn = $("#user-btn");
    const menu = $("#user-menu");
    if (!btn || !menu) return;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target) && e.target !== btn) {
        menu.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
      }
    });
    $("#menu-logout").addEventListener("click", async () => {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      me = null; renderAuth();
      showToast("已退出登录");
    });
    $("#menu-topup").addEventListener("click", openTopup);
    $("#menu-history").addEventListener("click", () => { location.href = "/orders"; });
    $("#credits-btn").addEventListener("click", openTopup);
  }

  // ---------- Billing ----------
  let pricingCache = null;
  async function fetchPricing() {
    if (pricingCache) return pricingCache;
    const r = await fetch("/api/pricing");
    pricingCache = await r.json();
    return pricingCache;
  }

  async function openTopup() {
    if (!ensureLoggedIn()) return;
    const mask = $("#topup-mask");
    mask.classList.add("open");
    const list = $("#topup-list");
    const unavailable = $("#topup-unavailable");
    const unavailableReason = $("#topup-unavailable-reason");
    try {
      const p = await fetchPricing();
      const stripeEnabled = Boolean(p.billing && p.billing.stripeEnabled);
      const reason = (p.billing && p.billing.stripeUnavailableReason) || "未配置 STRIPE_SECRET_KEY";
      if (unavailable) unavailable.hidden = stripeEnabled;
      if (unavailableReason) {
        unavailableReason.textContent = stripeEnabled
          ? ""
          : (reason + "，当前仅可查看套餐，暂不能发起支付。");
      }
      list.innerHTML = (p.packages || []).map((pkg) => {
        const price = (pkg.cents / 100).toFixed(2);
        const cur = (pkg.currency || "usd").toUpperCase();
        return \`
          <div class="pkg \${stripeEnabled ? "" : "disabled"}" \${stripeEnabled ? \`data-id="\${enc(pkg.id)}"\` : ""}>
            <div class="l">
              <strong>\${enc(pkg.label || pkg.id)}</strong>
              <span>\${fmt(pkg.credits)} 积分 · 约 \${fmt(Math.floor(pkg.credits / Math.max(1, p.asr.perMinuteCredits)))} 分钟 ASR</span>
            </div>
            <div class="r">\${cur} \${price}<small>一次性</small></div>
          </div>\`;
      }).join("") || "<div class='pkg' style='opacity:.6;'><div class='l'><strong>暂无可用套餐</strong></div><div class='r'>—</div></div>";
      if (stripeEnabled) {
        list.querySelectorAll(".pkg[data-id]").forEach((el) => {
          el.addEventListener("click", () => startCheckout(el.getAttribute("data-id")));
        });
      }
    } catch (e) {
      list.innerHTML = "<div class='pkg' style='opacity:.6;'><div class='l'><strong>套餐加载失败</strong><span>" + enc(e.message || e) + "</span></div></div>";
      if (unavailable) unavailable.hidden = true;
    }
  }
  function closeTopup() { $("#topup-mask").classList.remove("open"); }

  async function startCheckout(packageId) {
    try {
      const r = await fetch("/api/billing/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      if (r.status === 401) { showToast("请先登录"); location.href = "/api/auth/google/start"; return; }
      const j = await r.json();
      if (!r.ok || !j.url) throw new Error(j.message || j.error || "checkout_failed");
      location.href = j.url;
    } catch (e) {
      showToast("发起支付失败：" + (e.message || e));
    }
  }

  // ---------- Markdown 渲染 ----------
  // 通过 CDN 异步装载 marked；未到位时用极简 fallback（保段落、加粗、标题）。
  function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function fallbackMd(src) {
    const lines = String(src).split(/\\r?\\n/);
    const out = [];
    let para = [];
    const flush = () => { if (para.length) { out.push("<p>" + para.join("<br/>") + "</p>"); para = []; } };
    for (const ln of lines) {
      const t = ln.trim();
      if (!t) { flush(); continue; }
      if (t === "---") { flush(); out.push("<hr/>"); continue; }
      const h = t.match(/^(#{1,6})\\s+(.*)$/);
      if (h) { flush(); out.push("<h" + h[1].length + ">" + escapeHtml(h[2]) + "</h" + h[1].length + ">"); continue; }
      let html = escapeHtml(t).replace(/\\*\\*(.+?)\\*\\*/g, "<strong>$1</strong>");
      para.push(html);
    }
    flush();
    return out.join("\\n");
  }
  function md(src) {
    if (window.marked && typeof window.marked.parse === "function") {
      try { return window.marked.parse(src, { gfm: true, breaks: false }); } catch { /* fall back */ }
    }
    return fallbackMd(src);
  }

  // ---------- Generation ----------
  const form = $("#form");
  const urlIn = $("#url");
  const submit = $("#submit");
  const modelSwitch = $(".model-switch");
  const statusEl = $("#status");
  const metaEl = $("#meta");
  const tabsWrap = $("#viewbar");
  const downloadSubtitleBtn = $("#download-subtitle");
  const articleAll = $("#article-all");
  const articleA = $("#article-a");
  const articleB = $("#article-b");
  let subtitleText = "";

  // 高级设置回填
  const providerInputs = Array.from(document.querySelectorAll('input[name="provider"]'));
  const storedProvider = LS.get("t2d:provider", "gemini");
  providerInputs.forEach((el) => {
    el.checked = el.value === storedProvider;
    el.addEventListener("change", () => {
      if (el.checked) LS.set("t2d:provider", el.value);
    });
  });

  function selectedProvider() {
    const checked = providerInputs.find((el) => el.checked);
    return checked ? checked.value : "gemini";
  }

  let viewMode = LS.get("t2d:view", "all"); // "all" | "a" | "b"
  function applyView() {
    LS.set("t2d:view", viewMode);
    tabsWrap.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === viewMode));
    articleAll.hidden = viewMode !== "all";
    articleA.hidden = viewMode !== "a";
    articleB.hidden = viewMode !== "b";
  }
  tabsWrap.addEventListener("click", (e) => {
    const t = e.target.closest("[data-view]");
    if (!t) return;
    if (t.disabled) return;
    viewMode = t.dataset.view;
    applyView();
  });

  let abortCtrl = null;
  let busy = false;
  function setBusy(b) {
    busy = b;
    submit.textContent = b ? "停止" : "生成";
    submit.classList.toggle("stop", b);
    statusEl.classList.toggle("busy", b);
    urlIn.disabled = b;
    providerInputs.forEach((el) => { el.disabled = b; });
    modelSwitch?.classList.toggle("disabled", b);
  }

  // 接收的全文：用于 rAF 渲染节流；分隔 A/B 用 \\n---\\n
  let buffer = "";
  let pending = false;
  let hiddenRenderTimer = null;
  function scheduleRender() {
    if (pending) return;
    pending = true;
    const run = () => {
      pending = false;
      hiddenRenderTimer = null;
      const parts = buffer.split(/\\n-{3,}\\n/);
      const a = parts[0] || "";
      const b = parts.slice(1).join("\\n---\\n");

      articleAll.innerHTML = md(buffer);
      articleA.innerHTML = md(a);
      articleB.innerHTML = md(b);

      const hasB = b.trim().length > 0;
      tabsWrap.querySelector('[data-view="b"]').disabled = !hasB;

      // 每个视图单独维护 empty 状态，避免切换 tab 后出现“白线空白”。
      articleAll.classList.toggle("empty", !buffer.trim());
      articleA.classList.toggle("empty", !a.trim());
      articleB.classList.toggle("empty", !b.trim());
    };

    // 页面切到后台时 rAF 会被降频/暂停；改用定时器保证 SSE 内容持续刷新。
    if (document.hidden) {
      hiddenRenderTimer = setTimeout(run, 80);
      return;
    }
    requestAnimationFrame(run);
  }

  function setStreaming(s) {
    [articleAll, articleA, articleB].forEach((el) => el.classList.toggle("streaming", s));
  }

  function onSseEvent(kind, raw) {
    let data = raw;
    try { data = JSON.parse(raw); } catch {}
    if (kind === "status") {
      statusEl.textContent = String(data || "");
    } else if (kind === "subtitle") {
      subtitleText = String(data || "").trim();
      if (downloadSubtitleBtn) downloadSubtitleBtn.hidden = !subtitleText;
    } else if (kind === "chunk") {
      buffer += String(data || "");
      scheduleRender();
    } else if (kind === "error") {
      // server 可能塞 JSON 错误（credits_insufficient 等）
      let detail = data;
      if (typeof data === "string") {
        try { detail = JSON.parse(data); } catch {}
      }
      if (detail && typeof detail === "object" && detail.code === "auth_required") {
        const ec = detail.estCost;
        statusEl.textContent = "无可用字幕，转写需登录，约 " + (ec != null ? ec : "?") + " 积分";
        showToast("需要登录以使用转写");
        openAuthRequiredModal(detail.reason, detail.estCost);
        return;
      }
      if (detail && typeof detail === "object" && detail.code === "credits_insufficient") {
        statusEl.textContent = \`积分不足：需要 \${detail.required}，余额 \${detail.balance}\`;
        showToast("积分不足，请充值");
        openTopup();
        return;
      }
      statusEl.textContent = "出错：" + (typeof data === "string" ? data : JSON.stringify(data));
      showToast("生成失败");
    } else if (kind === "done") {
      // 不再 setBusy(false)，由 done 事件统一处理
    }
  }

  async function streamGenerate(payload) {
    abortCtrl = new AbortController();
    const r = await fetch("/api/generate", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(payload),
      signal: abortCtrl.signal,
    });

    // 同步错误（401/402/400/500）走 JSON 路径
    if (!r.ok) {
      let j = null;
      try { j = await r.json(); } catch {}
      if (r.status === 401) {
        if (j && j.error === "auth_required") {
          openAuthRequiredModal(j.reason, j.estCost);
          statusEl.textContent = "需要登录后才能使用转写";
          showToast("需要登录以使用转写");
          return;
        }
        showToast("请先登录");
        location.href = "/api/auth/google/start";
        return;
      }
      if (r.status === 402 || (j && j.error === "credits_insufficient")) {
        showToast("积分不足，请充值");
        openTopup();
        statusEl.textContent = j ? \`积分不足：需要 \${j.required ?? "?"}，余额 \${j.balance ?? "?"}\` : "积分不足";
        return;
      }
      throw new Error((j && (j.message || j.error)) || ("HTTP " + r.status));
    }

    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let acc = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      acc += dec.decode(value, { stream: true });

      let idx;
      while ((idx = acc.indexOf("\\n\\n")) !== -1) {
        const block = acc.slice(0, idx);
        acc = acc.slice(idx + 2);
        let evt = "message", dat = "";
        for (const ln of block.split("\\n")) {
          if (ln.startsWith("event:")) evt = ln.slice(6).trim();
          else if (ln.startsWith("data:")) dat += (dat ? "\\n" : "") + ln.slice(5).trim();
        }
        try { dat = JSON.parse(dat); } catch {}
        onSseEvent(evt, dat);
      }
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) {
      try { abortCtrl && abortCtrl.abort(); } catch {}
      setBusy(false);
      setStreaming(false);
      statusEl.textContent = "已中止";
      return;
    }
    const url = (urlIn.value || "").trim();
    if (!url) { showToast("请输入 YouTube 链接"); return; }

    buffer = "";
    subtitleText = "";
    if (downloadSubtitleBtn) downloadSubtitleBtn.hidden = true;
    scheduleRender();
    setBusy(true);
    setStreaming(true);
    statusEl.textContent = "正在准备…";
    metaEl.innerHTML = "";

    try {
      await streamGenerate({
        url,
        provider: selectedProvider(),
      });
      // 成功完成后刷新余额
      await refreshMe();
    } catch (e) {
      if (e && e.name === "AbortError") {
        statusEl.textContent = "已中止";
      } else {
        statusEl.textContent = "出错：" + (e && e.message || e);
        showToast("请求失败");
      }
    } finally {
      setBusy(false);
      setStreaming(false);
    }
  });

  // 关闭弹窗
  $("#topup-close").addEventListener("click", closeTopup);
  $("#topup-mask").addEventListener("click", (e) => { if (e.target.id === "topup-mask") closeTopup(); });
  const authC = $("#auth-cancel");
  if (authC) authC.addEventListener("click", closeAuthRequired);
  const authM = $("#auth-mask");
  if (authM) authM.addEventListener("click", (e) => { if (e.target && e.target.id === "auth-mask") closeAuthRequired(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeTopup(); closeAuthRequired(); }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && hiddenRenderTimer) {
      clearTimeout(hiddenRenderTimer);
      hiddenRenderTimer = null;
      scheduleRender();
    }
  });
  if (downloadSubtitleBtn) {
    downloadSubtitleBtn.addEventListener("click", () => {
      if (!subtitleText) {
        showToast("当前没有可下载的字幕");
        return;
      }
      const blob = new Blob([subtitleText + "\\n"], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "subtitle.txt";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  // 充值结果回流
  const params = new URLSearchParams(location.search);
  if (params.get("topup") === "success") { showToast("充值成功，余额已更新"); history.replaceState({}, "", location.pathname); }
  else if (params.get("topup") === "cancel") { showToast("充值已取消"); history.replaceState({}, "", location.pathname); }

  // 初始化
  bindMenu();
  applyView();
  refreshMe();
})();
`;
