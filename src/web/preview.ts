export const PREVIEW_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Talk2Doc · 正文预览</title>
  <style>
    body { margin: 0; background: #f7f4ec; color: #1f1a16; font: 16px/1.75 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
    .wrap { max-width: 900px; margin: 0 auto; padding: 20px 16px 56px; }
    .top { display: flex; gap: 8px; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .btn { border: 1px solid #ddd3c1; background: #fff; color: #1f1a16; border-radius: 8px; padding: 7px 11px; text-decoration: none; font-size: 13px; cursor: pointer; }
    .btn:hover { border-color: #b45133; color: #b45133; }
    .meta { background: #fff; border: 1px solid #ddd3c1; border-radius: 10px; padding: 12px; margin-bottom: 12px; color: #544c43; font-size: 13px; }
    .article { background: #fff; border: 1px solid #ddd3c1; border-radius: 12px; padding: 18px; min-height: 180px; }
    .empty { color: #7d756c; }
    pre { white-space: pre-wrap; word-break: break-word; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/marked@13.0.3/marked.min.js" defer crossorigin="anonymous"></script>
</head>
<body>
  <main class="wrap">
    <div class="top">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <a class="btn" href="/orders">返回历史记录</a>
        <a class="btn" href="/">回到首页</a>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="download-md" class="btn" type="button">下载 MD</button>
        <button id="download-html" class="btn" type="button">下载 HTML</button>
        <button id="download-pdf" class="btn" type="button">下载 PDF</button>
      </div>
    </div>
    <div id="meta" class="meta">加载中…</div>
    <article id="article" class="article"><div class="empty">正在加载正文…</div></article>
  </main>
  <script>
    (function () {
      "use strict";
      const q = new URLSearchParams(location.search);
      const id = q.get("id") || "";
      const source = q.get("source") || "cloud";
      const meta = document.getElementById("meta");
      const article = document.getElementById("article");
      const btnMd = document.getElementById("download-md");
      const btnHtml = document.getElementById("download-html");
      const btnPdf = document.getElementById("download-pdf");
      let currentMd = "";

      function esc(s) {
        return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
      }
      function renderMarkdown(md) {
        if (!md || !String(md).trim()) return "<div class='empty'>该记录暂无正文内容。</div>";
        if (window.marked && typeof window.marked.parse === "function") {
          try { return window.marked.parse(String(md), { gfm: true, breaks: false }); } catch {}
        }
        return "<pre>" + esc(md) + "</pre>";
      }
      function fileSafeTs() {
        const d = new Date();
        const p = (n) => String(n).padStart(2, "0");
        return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
      }
      function downloadTextFile(name, content, mime) {
        const blob = new Blob([String(content || "")], { type: mime || "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      function localRecord() {
        try {
          const list = JSON.parse(localStorage.getItem("t2d:localHistory") || "[]");
          if (!Array.isArray(list)) return null;
          return list.find((x) => String(x.id || "") === id) || null;
        } catch { return null; }
      }

      async function load() {
        if (!id) {
          meta.textContent = "缺少记录 id。";
          article.innerHTML = "<div class='empty'>请从历史记录页进入。</div>";
          return;
        }

        let rec = null;
        if (source === "local") {
          rec = localRecord();
        } else {
          const r = await fetch("/api/conversions/detail?id=" + encodeURIComponent(id), { credentials: "include" });
          if (r.ok) {
            const j = await r.json();
            rec = j.record || null;
          } else if (r.status === 401) {
            meta.innerHTML = "云端记录需要登录后查看。<a href='/api/auth/google/start'>去登录</a>";
            article.innerHTML = "<div class='empty'>未登录，无法读取云端记录。</div>";
            return;
          }
        }

        if (!rec) {
          meta.textContent = "记录不存在或已失效。";
          article.innerHTML = "<div class='empty'>没有找到对应记录。</div>";
          return;
        }

        const srcUrl = rec.sourceUrl || rec.source_url || "-";
        meta.innerHTML = "状态：" + esc(rec.status || "-")
          + " · 模型：" + esc((rec.provider || "-") + (rec.model ? " / " + rec.model : ""))
          + "<br/>链接：<a href='" + esc(srcUrl) + "' target='_blank' rel='noreferrer'>" + esc(srcUrl) + "</a>";
        currentMd = String(rec.articleMarkdown || rec.article_markdown || "");
        article.innerHTML = renderMarkdown(currentMd);
      }

      btnMd.addEventListener("click", function () {
        if (!currentMd.trim()) return;
        downloadTextFile("talk2doc-preview-" + fileSafeTs() + ".md", currentMd, "text/markdown;charset=utf-8");
      });
      btnHtml.addEventListener("click", function () {
        if (!currentMd.trim()) return;
        const html = "<!doctype html><html lang='zh-CN'><head><meta charset='UTF-8' /><title>Talk2Doc 导出</title><style>body{max-width:860px;margin:24px auto;padding:0 16px;font:16px/1.7 -apple-system,BlinkMacSystemFont,PingFang SC,Microsoft YaHei,sans-serif}</style></head><body>" + renderMarkdown(currentMd) + "</body></html>";
        downloadTextFile("talk2doc-preview-" + fileSafeTs() + ".html", html, "text/html;charset=utf-8");
      });
      btnPdf.addEventListener("click", function () {
        if (!currentMd.trim()) return;
        const w = window.open("", "_blank");
        if (!w) return;
        const html = "<!doctype html><html lang='zh-CN'><head><meta charset='UTF-8' /><title>Talk2Doc PDF</title><style>body{max-width:860px;margin:24px auto;padding:0 16px;font:16px/1.7 -apple-system,BlinkMacSystemFont,PingFang SC,Microsoft YaHei,sans-serif}@media print{body{margin:0 auto;padding:0}}</style></head><body>" + renderMarkdown(currentMd) + "</body></html>";
        w.document.open();
        w.document.write(html);
        w.document.close();
        setTimeout(() => w.print(), 120);
      });

      load().catch((e) => {
        meta.textContent = "加载失败";
        article.innerHTML = "<div class='empty'>加载失败：" + esc(e && e.message || e) + "</div>";
      });
    })();
  </script>
</body>
</html>`;
