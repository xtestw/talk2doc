// YouTubeProvider：编排 player → caption → storyboard，产出 TranscriptResult

import type { TranscriptProvider, TranscriptResult } from "../types";
import { fetchCaptionJson3 } from "./caption";
import { fetchPlayerResponse, pickCaptionTrack } from "./innertube";
import { tryFetchStoryboardLevel0 } from "./storyboard";

export const YouTubeProvider: TranscriptProvider = {
  id: "youtube",

  supports(input: string): boolean {
    return extractVideoId(input) !== null;
  },

  async extract(input, opts) {
    const videoId = extractVideoId(input);
    if (!videoId) throw new Error("不是合法的 YouTube 链接");
    return await extract(videoId, opts?.signal);
  },
};

// YouTube 视频 ID 固定为 11 位 base64url 字符
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function extractVideoId(input: string): string | null {
  try {
    const u = new URL(input);
    const host = u.hostname.replace(/^(www\.|m\.)/, "");
    if (host === "youtube.com") {
      // /watch?v=ID
      const v = u.searchParams.get("v");
      if (v && VIDEO_ID_RE.test(v)) return v;
      // /shorts/ID、/embed/ID、/v/ID
      const m = u.pathname.match(/^\/(shorts|embed|v)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[2];
      return null;
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0] ?? "";
      return VIDEO_ID_RE.test(id) ? id : null;
    }
    return null;
  } catch {
    return null;
  }
}

async function extract(videoId: string, signal?: AbortSignal): Promise<TranscriptResult> {
  const player = await fetchPlayerResponse(videoId, signal);

  const status = player.playabilityStatus?.status;
  if (status && status !== "OK") {
    const reason = player.playabilityStatus?.reason || status;
    throw new Error(`视频不可播放：${reason}`);
  }

  const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const track = pickCaptionTrack(tracks);
  if (!track) {
    throw new Error("该视频没有可用字幕，请换一个有字幕的视频");
  }
  const { text, lines } = await fetchCaptionJson3(track, signal);

  const sprite = await tryFetchStoryboardLevel0(
    player.storyboards?.playerStoryboardSpecRenderer?.spec,
    signal,
  );

  return {
    source: "youtube",
    videoId,
    title: player.videoDetails?.title ?? "",
    author: player.videoDetails?.author ?? "",
    durationSec: parseInt(player.videoDetails?.lengthSeconds ?? "0", 10) || 0,
    subtitle: text,
    subtitleLines: lines,
    subtitleLang: track.languageCode + (track.kind === "asr" ? "(asr)" : ""),
    frames: sprite ? [sprite] : [],
  };
}
