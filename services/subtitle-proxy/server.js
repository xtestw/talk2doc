import "dotenv/config";
import Fastify from "fastify";
import axios from "axios";
import OSS from "ali-oss";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { ProxyPool } from "./proxy-pool.js";

const ANDROID_KEY = "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w";
const ANDROID_VERSION = "20.10.38";
const ANDROID_UA =
  `com.google.android.youtube/${ANDROID_VERSION} (Linux; U; Android 14; en_US) gzip`;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const port = Number(process.env.PORT || 3100);
const host = process.env.HOST || "0.0.0.0";
const ossClient = createOssClient();
const ossPublicBaseUrl = String(process.env.OSS_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");

// 仅显式配置 PROXY_POOL 时启用代理；默认始终直连。
const configuredProxies = process.env.PROXY_POOL || "";
const proxyPool = new ProxyPool(configuredProxies, {
  cooldownMs: Number(process.env.PROXY_COOLDOWN_MS || 20_000),
});
const agentByProxy = new Map();

if (proxyPool.list().length > 0) {
  const masked = proxyPool.list().map((p) => maskProxy(p.url));
  console.log(`[subtitle-proxy] proxy pool enabled (${masked.length}): ${masked.join(", ")}`);
}

const app = Fastify({ logger: true });

app.get("/health", async () => ({ ok: true }));
app.get("/healthz", async () => ({
  ok: true,
  service: "subtitle-proxy",
  uptimeSec: Math.floor(process.uptime()),
  now: new Date().toISOString(),
  proxy: {
    enabled: proxyPool.list().length > 0,
    size: proxyPool.list().length,
  },
}));

app.get("/api/transcript/youtube", async (req, reply) => {
  const q = req.query && typeof req.query === "object" ? req.query : {};
  const url = String(q.url || "").trim();
  return handleYoutubeTranscript(url, req, reply);
});

app.post("/api/transcript/youtube", async (req, reply) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const url = String(body.url || "").trim();
  return handleYoutubeTranscript(url, req, reply);
});

async function handleYoutubeTranscript(url, req, reply) {
  if (!url) {
    return reply.code(400).send({ error: "bad_request", message: "missing url" });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return reply.code(400).send({ error: "bad_request", message: "invalid youtube url" });
  }

  try {
    const player = await fetchPlayerResponse(videoId, req.log);
    const status = player.playabilityStatus?.status;
    if (status && status !== "OK") {
      const reason = player.playabilityStatus?.reason || status;
      return reply.code(502).send({
        error: "youtube_unplayable",
        message: reason,
        videoId,
      });
    }

    const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    const track = pickCaptionTrack(tracks);
    if (!track) {
      return reply.code(404).send({
        error: "subtitle_unavailable",
        message: "no caption track",
        videoId,
      });
    }

    const subtitle = await fetchCaptionJson3(track.baseUrl, req.log);
    const ossUrl = await uploadSubtitleToOss({
      videoId,
      subtitleText: subtitle.text,
      log: req.log,
    });
    return reply.send({
      source: "youtube",
      videoId,
      title: player.videoDetails?.title ?? "",
      author: player.videoDetails?.author ?? "",
      durationSec: parseInt(player.videoDetails?.lengthSeconds ?? "0", 10) || 0,
      subtitleLines: subtitle.lines,
      subtitleLang: track.languageCode + (track.kind === "asr" ? "(asr)" : ""),
      ossUrl,
    });
  } catch (err) {
    req.log.error({ err }, "fetch subtitle failed");
    return reply.code(503).send({
      error: "subtitle_fetch_failed",
      message: err instanceof Error ? err.message : String(err),
      videoId,
    });
  }
}

app.listen({ port, host }).then(() => {
  console.log(`[subtitle-proxy] listening on http://${host}:${port}`);
});

function extractVideoId(input) {
  try {
    const u = new URL(input);
    const hostName = u.hostname.replace(/^(www\.|m\.)/, "");
    if (hostName === "youtube.com") {
      const v = u.searchParams.get("v");
      if (v && VIDEO_ID_RE.test(v)) return v;
      const m = u.pathname.match(/^\/(shorts|embed|v)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[2];
      return null;
    }
    if (hostName === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0] ?? "";
      return VIDEO_ID_RE.test(id) ? id : null;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchPlayerResponse(videoId, log) {
  const endpoint = `https://www.youtube.com/youtubei/v1/player?key=${ANDROID_KEY}`;
  return await requestJsonWithProxyPool(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": ANDROID_UA,
        "X-YouTube-Client-Name": "3",
        "X-YouTube-Client-Version": ANDROID_VERSION,
      },
      data: {
        videoId,
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: ANDROID_VERSION,
            androidSdkVersion: 34,
            hl: "en",
            gl: "US",
          },
        },
      },
    },
    log,
    "youtube player failed",
  );
}

function pickCaptionTrack(tracks) {
  if (!Array.isArray(tracks) || tracks.length === 0) return null;
  const score = (t) => {
    const lc = String(t.languageCode || "").toLowerCase();
    const auto = t.kind === "asr";
    let s = 0;
    if (lc.startsWith("zh")) s += 100;
    else if (lc.startsWith("en")) s += 50;
    else s += 10;
    if (!auto) s += 20;
    return s;
  };
  return [...tracks].sort((a, b) => score(b) - score(a))[0];
}

async function fetchCaptionJson3(baseUrl, log) {
  const url = String(baseUrl).replace(/[&?]fmt=[^&]*/g, "") + "&fmt=json3";
  const json = await requestJsonWithProxyPool(
    url,
    { method: "GET", headers: { "User-Agent": ANDROID_UA } },
    log,
    "youtube caption failed",
  );
  const out = [];
  for (const ev of json.events ?? []) {
    if (!ev.segs) continue;
    const txt = ev.segs
      .map((s) => s.utf8 ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!txt) continue;
    out.push(`[${formatTime(ev.tStartMs ?? 0)}] ${txt}`);
  }
  if (out.length === 0) throw new Error("empty subtitle");
  return { text: out.join("\n"), lines: out.length };
}

function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function maskProxy(input) {
  try {
    const u = new URL(input);
    const user = u.username ? "***" : "";
    const pass = u.password ? ":***" : "";
    const auth = user || pass ? `${user}${pass}@` : "";
    return `${u.protocol}//${auth}${u.host}`;
  } catch {
    return "invalid_proxy_url";
  }
}

async function requestJsonWithProxyPool(url, config, log, errorPrefix) {
  const poolSize = proxyPool.list().length;
  const maxAttempts = Math.max(1, poolSize + 1);
  let lastError = null;

  for (let i = 0; i < maxAttempts; i += 1) {
    const proxy = proxyPool.next();
    try {
      const agent = proxy ? getProxyAgent(proxy.url) : undefined;
      const resp = await axios.request({
        url,
        method: config.method,
        headers: config.headers,
        data: config.data,
        timeout: 12_000,
        validateStatus: () => true,
        proxy: false,
        httpAgent: agent,
        httpsAgent: agent,
      });
      if (resp.status >= 200 && resp.status < 300) {
        proxyPool.markSuccess(proxy?.id);
        return resp.data;
      }
      const err = new Error(`${errorPrefix}: HTTP ${resp.status}`);
      if (proxy) {
        proxyPool.markFailure(proxy.id);
      }
      lastError = err;
      log?.warn?.({
        msg: "proxy_attempt_failed",
        target: urlHost(url),
        proxy: proxy ? maskProxy(proxy.url) : "direct",
        status: resp.status,
      });
    } catch (err) {
      if (proxy) {
        proxyPool.markFailure(proxy.id);
      }
      lastError = err instanceof Error ? err : new Error(String(err));
      log?.warn?.({
        msg: "proxy_attempt_error",
        target: urlHost(url),
        proxy: proxy ? maskProxy(proxy.url) : "direct",
        error: lastError.message,
      });
    }
  }

  throw lastError || new Error(`${errorPrefix}: all attempts failed`);
}

function getProxyAgent(proxyUrl) {
  if (!agentByProxy.has(proxyUrl)) {
    const lower = proxyUrl.toLowerCase();
    if (lower.startsWith("socks://") || lower.startsWith("socks4://") || lower.startsWith("socks5://")) {
      agentByProxy.set(proxyUrl, new SocksProxyAgent(proxyUrl));
    } else {
      agentByProxy.set(proxyUrl, new HttpsProxyAgent(proxyUrl));
    }
  }
  return agentByProxy.get(proxyUrl);
}

function urlHost(input) {
  try {
    return new URL(input).host;
  } catch {
    return "unknown";
  }
}

function createOssClient() {
  const endpoint = String(process.env.OSS_ENDPOINT || "").trim();
  const bucket = String(process.env.OSS_BUCKET || "").trim();
  const region = String(process.env.OSS_REGION || "").trim();
  const accessKeyId = String(process.env.OSS_ACCESS_KEY_ID || "").trim();
  const accessKeySecret = String(process.env.OSS_ACCESS_KEY_SECRET || "").trim();
  if (!endpoint || !bucket || !region || !accessKeyId || !accessKeySecret) {
    return null;
  }
  return new OSS({
    endpoint,
    bucket,
    region,
    accessKeyId,
    accessKeySecret,
  });
}

async function uploadSubtitleToOss({ videoId, subtitleText, log }) {
  if (!ossClient) {
    throw new Error("OSS not configured");
  }
  const date = new Date();
  const day = date.toISOString().slice(0, 10);
  const key = `subtitles/${day}/${videoId}-${Date.now()}.txt`;
  const body = Buffer.from(`${subtitleText}\n`, "utf8");
  await ossClient.put(key, body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
  const ossUrl = buildOssUrl(key);
  log?.info?.({ msg: "subtitle_uploaded_to_oss", key, ossUrl });
  return ossUrl;
}

function buildOssUrl(key) {
  if (ossPublicBaseUrl) return `${ossPublicBaseUrl}/${key}`;
  const endpoint = String(process.env.OSS_ENDPOINT || "").trim().replace(/^https?:\/\//, "");
  const bucket = String(process.env.OSS_BUCKET || "").trim();
  return `https://${bucket}.${endpoint}/${key}`;
}
