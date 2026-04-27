export const ORDERS_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Talk2Doc · 订单与积分</title>
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
    .pill.pending { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 45%, var(--rule)); }
    .pill.failed { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 45%, var(--rule)); }
  </style>
</head>
<body>
  <main class="wrap">
    <div class="top">
      <h1>订单与积分流水</h1>
      <div class="actions">
        <a class="btn" href="/">返回首页</a>
        <button id="refresh" class="btn" type="button">刷新</button>
      </div>
    </div>

    <section id="login-tip" class="card" hidden>
      <strong>当前未登录</strong>
      <p class="muted">你可以先浏览本页面。登录后即可查看自己的订单与积分流水。</p>
      <a class="btn" href="/api/auth/google/start">使用 Google 登录</a>
    </section>

    <section id="summary" class="card" hidden>
      <div><strong id="who">-</strong></div>
      <div class="muted">当前余额：<strong id="credits">0</strong> 积分</div>
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

      async function load() {
        const meRes = await fetch("/api/auth/me", { credentials: "include" });
        const meJson = await meRes.json().catch(() => ({ user: null }));
        const user = meJson.user || null;
        const loginTip = $("#login-tip");
        const summary = $("#summary");
        if (!user) {
          loginTip.hidden = false;
          summary.hidden = true;
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

        const r = await fetch("/api/billing/history", { credentials: "include" });
        const j = await r.json();
        const orders = Array.isArray(j.orders) ? j.orders : [];
        const txs = Array.isArray(j.txs) ? j.txs : [];

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
      load().catch((e) => {
        console.error(e);
        $("#orders-empty").hidden = false;
        $("#txs-empty").hidden = false;
      });
    })();
  </script>
</body>
</html>`;
