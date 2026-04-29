# subtitle-proxy

独立部署在 VPS 的 YouTube 字幕抓取服务（纯 Node.js）。

## 1) 安装

```bash
cd services/subtitle-proxy
npm install
cp .env.example .env
# 编辑 .env，填入 OSS/代理配置
```

## 2) 启动

```bash
npm run start
```

默认监听：`0.0.0.0:3100`

可选环境变量：

- `PORT`：端口（默认 `3100`）
- `HOST`：监听地址（默认 `0.0.0.0`）
- `PROXY_POOL`：代理池（逗号或换行分隔，支持 `socks5://` / `http://` / `https://`）
- `PROXY_COOLDOWN_MS`：代理失败后的冷却时间（默认 `20000`）
- `OSS_ENDPOINT`：阿里云 OSS endpoint（如 `oss-cn-hangzhou.aliyuncs.com`）
- `OSS_REGION`：阿里云 OSS region（如 `oss-cn-hangzhou`）
- `OSS_BUCKET`：阿里云 OSS bucket 名称
- `OSS_ACCESS_KEY_ID`：阿里云 AK
- `OSS_ACCESS_KEY_SECRET`：阿里云 SK
- `OSS_PUBLIC_BASE_URL`：可选，OSS 公网访问前缀（如 `https://your-bucket.oss-cn-hangzhou.aliyuncs.com`）

注意：**未配置 `PROXY_POOL` 时，服务始终直连，不走任何代理**。

示例（走代理）：

```bash
PROXY_POOL="socks5://127.0.0.1:1080,http://127.0.0.1:7890" PORT=3100 npm run start
```

## 3) 接口

### `GET /health`

返回：

```json
{ "ok": true }
```

### `GET /healthz`

返回（示例）：

```json
{
  "ok": true,
  "service": "subtitle-proxy",
  "uptimeSec": 12,
  "now": "2026-04-29T06:11:00.000Z",
  "proxy": {
    "enabled": false,
    "size": 0
  }
}
```

### `POST /api/transcript/youtube`

请求体：

```json
{
  "url": "https://www.youtube.com/watch?v=xRh2sVcNXQ8"
}
```

成功返回：

```json
{
  "source": "youtube",
  "videoId": "xRh2sVcNXQ8",
  "title": "...",
  "author": "...",
  "durationSec": 4860,
  "subtitleLines": 2801,
  "subtitleLang": "en(asr)",
  "ossUrl": "https://your-bucket.oss-cn-hangzhou.aliyuncs.com/subtitles/2026-04-29/xRh2sVcNXQ8-1234567890.txt"
}
```

失败返回示例：

- `400 bad_request`：链接不合法
- `404 subtitle_unavailable`：无可用字幕轨
- `502 youtube_unplayable`：视频不可播放（例如 bot 校验）
- `503 subtitle_fetch_failed`：抓取过程失败

### `GET /api/transcript/youtube?url=...`

与 POST 逻辑一致，便于浏览器地址栏或简单探活脚本直接调用。
