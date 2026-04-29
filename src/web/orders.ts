export const ORDERS_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Talk2Doc · 历史记录与账单</title>
  <style>
    :root {
      --bg: #fbfaf6;
      --surface: #ffffff;
      --ink: #1a1a1a;
      --muted: #737373;
      --rule: #e6e2d8;
      --accent: #b1442b;
      --ok: #2f7f46;
      --warn: #c25c2e;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #14130f;
        --surface: #1c1b17;
        --ink: #ececec;
        --muted: #9b968d;
        --rule: #2a2823;
        --accent: #e58264;
        --ok: #66c185;
        --warn: #e5a264;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font: 15px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    .wrap { max-width: 980px; margin: 0 auto; padding: 24px; }
    .top {
      display: flex; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 16px;
    }
    h1 { margin: 0; font-size: 22px; }
    .actions { display: flex; gap: 8px; }
    .btn {
      border: 1px solid var(--rule); border-radius: 8px; background: var(--surface);
      padding: 8px 12px; color: var(--ink); text-decoration: none; cursor: pointer;
      font-size: 13px;
    }
    .btn:hover { border-color: var(--accent); color: var(--accent); }
    .card {
      background: var(--surface); border: 1px solid var(--rule); border-radius: 12px; padding: 14px 16px;
      margin-bottom: 12px;
    }
    .muted { color: var(--muted); }
    .warn { color: var(--warn); }
    .ok { color: var(--ok); }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 8px; border-bottom: 1px solid var(--rule); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-weight: 600; font-size: 12px; }
    tr:last-child td { border-bottom: 0; }
    .pill { padding: 2px 8px; border-radius: 999px; font-size: 12px; border: 1px solid var(--rule); }
    .pill.paid { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 45%, var(--rule)); }
    .pill.success { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 45%, var(--rule)); }
    .pill.pending { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 45%, var(--rule)); }
    .pill.failed { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 45%, var(--rule)); }
  </style>
</head>
<body>
  <main class="wrap">
    <div class="top">
      <h1>历史记录与账单</h1>
      <div class="actions">
        <a class="btn" href="/">返回首页</a>
        <button id="refresh" class="btn" type="button">刷新</button>
      </div>
    </div>

    <section id="login-tip" class="card" hidden>
      <strong>当前未登录</strong>
      <p class="muted">已为你展示本机历史转换记录。登录后可查看云端历史、充值订单与积分流水。</p>
      <a class="btn" href="/api/auth/google/start">使用 Google 登录</a>
    </section>

    <section id="summary" class="card" hidden>
      <div><strong id="who">-</strong></div>
      <div class="muted">当前余额：<strong id="credits">0</strong> 积分</div>
    </section>
    <section id="history-note" class="card muted" hidden></section>

    <section class="card">
      <h2>历史转换记录</h2>
      <div id="convs-empty" class="muted" hidden>暂无历史转换记录。</div>
      <table id="convs-table" hidden>
        <thead><tr><th>时间</th><th>状态</th><th>链接</th><th>模型</th><th>正文预览</th><th>操作</th></tr></thead>
        <tbody id="convs-body"></tbody>
      </table>
    </section>

    <section class="card">
      <h2>充值订单</h2>
      <div id="orders-empty" class="muted" hidden>暂无订单记录。</div>
      <table id="orders-table" hidden>
        <thead><tr><th>时间</th><th>状态</th><th>金额</th><th>积分</th><th>订单号</th></tr></thead>
        <tbody id="orders-body"></tbody>
      </table>
    </section>

    <section class="card">
      <h2>积分流水</h2>
      <div id="txs-empty" class="muted" hidden>暂无积分流水。</div>
      <table id="txs-table" hidden>
        <thead><tr><th>时间</th><th>原因</th><th>变动</th><th>余额</th><th>关联ID</th></tr></thead>
        <tbody id="txs-body"></tbody>
      </table>
    </section>
  </main>
  <script>
    (function () {
      "use strict";
      const $ = (s) => document.querySelector(s);
      const fmt = (n) => Number(n || 0).toLocaleString();
      const money = (c, cur) => (Number(c || 0) / 100).toFixed(2) + " " + String(cur || "usd").toUpperCase();
      const time = (ts) => {
        if (!ts) return "-";
        try { return new Date(ts).toLocaleString("zh-CN"); } catch { return "-"; }
      };
      function esc(s) {
        return String(s ?? "").replace(/[&<>"']/g, (c) => {
          if (c === "&") return "&amp;";
          if (c === "<") return "&lt;";
          if (c === ">") return "&gt;";
          if (c === '"') return "&quot;";
          return "&#39;";
        });
      }

      function renderConversions(records) {
        const convs = Array.isArray(records) ? records : [];
        if (convs.length === 0) {
          $("#convs-empty").hidden = false;
          $("#convs-table").hidden = true;
          return;
        }
        $("#convs-empty").hidden = true;
        $("#convs-table").hidden = false;
        $("#convs-body").innerHTML = convs.map((c) => {
          const article = String(c.articleMarkdown || c.article_markdown || "");
          const normalized = article
            .replace(/[#>*_~\\-]/g, " ")
            .replace(/\\r?\\n/g, " ")
            .replace(/\\s+/g, " ")
            .trim();
          const preview = normalized
            ? (normalized.length > 140 ? normalized.slice(0, 140) + "…" : normalized)
            : "（无正文预览）";
          const status = String(c.status || "unknown");
          const link = String(c.sourceUrl || c.source_url || c.url || "-");
          const linkHtml = /^https?:\\/\\//i.test(link)
            ? "<a href='" + esc(link) + "' target='_blank' rel='noreferrer'>" + esc(link) + "</a>"
            : esc(link);
          const fallbackMsg = c.errorMessage || c.error_message || "-";
          const recordId = String(c.id || "");
          const from = String(c.userId || c.user_id || "") ? "cloud" : "local";
          const previewLink = recordId
            ? "<a href='/preview?id=" + encodeURIComponent(recordId) + "&source=" + from + "' target='_blank' rel='noreferrer'>查看详情</a>"
            : esc(preview || fallbackMsg);
          const delBtn = recordId
            ? "<button class='btn conv-del' data-id='" + esc(recordId) + "' data-source='" + from + "' type='button'>删除</button>"
            : "-";
          return "<tr>" +
            "<td>" + esc(time(c.createdAt || c.created_at)) + "</td>" +
            "<td><span class='pill " + esc(status) + "'>" + esc(status) + "</span></td>" +
            "<td class='muted'>" + linkHtml + "</td>" +
            "<td>" + esc((c.provider || "-") + (c.model ? " / " + c.model : "")) + "</td>" +
            "<td>" + previewLink + "</td>" +
            "<td>" + delBtn + "</td>" +
          "</tr>";
        }).join("");
      }

      async function deleteCloudRecord(id) {
        const r = await fetch("/api/conversions/delete", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (!r.ok) throw new Error("删除云端记录失败");
      }

      function deleteLocalRecord(id) {
        const list = JSON.parse(localStorage.getItem("t2d:localHistory") || "[]");
        if (!Array.isArray(list)) return;
        const next = list.filter((x) => String(x.id || "") !== String(id));
        localStorage.setItem("t2d:localHistory", JSON.stringify(next));
      }

      async function load() {
        const meRes = await fetch("/api/auth/me", { credentials: "include" });
        const meJson = await meRes.json().catch(() => ({ user: null }));
        const user = meJson.user || null;
        const loginTip = $("#login-tip");
        const summary = $("#summary");
        if (!user) {
          loginTip.hidden = false;
          summary.hidden = true;
          const local = JSON.parse(localStorage.getItem("t2d:localHistory") || "[]");
          renderConversions(local);
          $("#orders-empty").hidden = false;
          $("#txs-empty").hidden = false;
          $("#orders-table").hidden = true;
          $("#txs-table").hidden = true;
          return;
        }
        loginTip.hidden = true;
        summary.hidden = false;
        $("#who").textContent = user.name || user.email || user.id;
        $("#credits").textContent = fmt(user.credits);

        const [billingRes, convRes] = await Promise.all([
          fetch("/api/billing/history", { credentials: "include" }),
          fetch("/api/conversions/history", { credentials: "include" }),
        ]);
        const billingJson = await billingRes.json();
        const convJson = await convRes.json().catch(() => ({}));
        const orders = Array.isArray(billingJson.orders) ? billingJson.orders : [];
        const txs = Array.isArray(billingJson.txs) ? billingJson.txs : [];
        let convs = Array.isArray(convJson.records) ? convJson.records : [];
        const note = $("#history-note");
        if (!convRes.ok) {
          convs = JSON.parse(localStorage.getItem("t2d:localHistory") || "[]");
          note.hidden = false;
          note.textContent = "云端历史暂不可用，当前展示本地历史。若刚升级，请先执行数据库迁移（db:migrate）。";
        } else {
          note.hidden = true;
          note.textContent = "";
        }
        renderConversions(convs);

        if (orders.length === 0) {
          $("#orders-empty").hidden = false;
          $("#orders-table").hidden = true;
        } else {
          $("#orders-empty").hidden = true;
          $("#orders-table").hidden = false;
          $("#orders-body").innerHTML = orders.map((o) =>
            "<tr>" +
            "<td>" + esc(time(o.created_at || o.createdAt)) + "</td>" +
            "<td><span class='pill " + esc(o.status) + "'>" + esc(o.status) + "</span></td>" +
            "<td>" + esc(money(o.amount_cents, o.currency)) + "</td>" +
            "<td>+" + esc(fmt(o.credits_granted)) + "</td>" +
            "<td class='muted'>" + esc(o.id) + "</td>" +
            "</tr>"
          ).join("");
        }

        if (txs.length === 0) {
          $("#txs-empty").hidden = false;
          $("#txs-table").hidden = true;
        } else {
          $("#txs-empty").hidden = true;
          $("#txs-table").hidden = false;
          $("#txs-body").innerHTML = txs.map((t) => {
            const delta = Number(t.delta || 0);
            const cls = delta >= 0 ? "ok" : "warn";
            return "<tr>" +
              "<td>" + esc(time(t.created_at || t.createdAt)) + "</td>" +
              "<td>" + esc(t.reason) + "</td>" +
              "<td class='" + cls + "'>" + esc((delta > 0 ? "+" : "") + fmt(delta)) + "</td>" +
              "<td>" + esc(fmt(t.balance_after || t.balanceAfter)) + "</td>" +
              "<td class='muted'>" + esc(t.ref_id || t.refId || "-") + "</td>" +
            "</tr>";
          }).join("");
        }
      }

      $("#refresh").addEventListener("click", function () { load().catch(console.error); });
      document.addEventListener("click", async function (e) {
        const btn = e.target && e.target.closest ? e.target.closest(".conv-del") : null;
        if (!btn) return;
        const id = btn.getAttribute("data-id") || "";
        const source = btn.getAttribute("data-source") || "local";
        if (!id) return;
        if (!confirm("确认删除这条历史记录？")) return;
        try {
          if (source === "cloud") await deleteCloudRecord(id);
          else deleteLocalRecord(id);
          await load();
        } catch (err) {
          alert("删除失败：" + (err && err.message || err));
        }
      });
      load().catch((e) => {
        console.error(e);
        $("#orders-empty").hidden = false;
        $("#txs-empty").hidden = false;
      });
    })();
  </script>
</body>
</html>`;
