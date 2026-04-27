// InnerTube ANDROID /player：拿元信息 + caption 列表 + storyboard spec
// 走 ANDROID 客户端是绕过 PoT 软封的关键，WEB 客户端 2024 起会返回 200/空 body。

const ANDROID_KEY = "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w";
const ANDROID_VERSION = "20.10.38";
export const ANDROID_UA =
  `com.google.android.youtube/${ANDROID_VERSION} (Linux; U; Android 14; en_US) gzip`;

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  /** "asr" 表示自动生成；缺省/其他值视为人工字幕 */
  kind?: string;
  name?: { simpleText?: string };
}

export interface AdaptiveFormat {
  itag?: number;
  url?: string;
  mimeType?: string;
  bitrate?: number;
  averageBitrate?: number;
  contentLength?: string;
  audioQuality?: string;
}

export interface PlayerResponse {
  videoDetails?: { title?: string; author?: string; lengthSeconds?: string };
  playabilityStatus?: { status?: string; reason?: string };
  captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
  storyboards?: { playerStoryboardSpecRenderer?: { spec?: string } };
  streamingData?: {
    adaptiveFormats?: AdaptiveFormat[];
    formats?: AdaptiveFormat[];
  };
}

/** 选最低码率 audio-only 流。返回 null 表示没有可下载的音频直链。 */
export function pickLowestBitrateAudio(player: PlayerResponse): AdaptiveFormat | null {
  const all = player.streamingData?.adaptiveFormats ?? [];
  const audios = all.filter((f) => f.url && (f.mimeType || "").toLowerCase().startsWith("audio/"));
  if (audios.length === 0) return null;
  return [...audios].sort(
    (a, b) => (a.bitrate ?? a.averageBitrate ?? Infinity) - (b.bitrate ?? b.averageBitrate ?? Infinity),
  )[0]!;
}

export async function fetchPlayerResponse(
  videoId: string,
  signal?: AbortSignal,
): Promise<PlayerResponse> {
  const resp = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${ANDROID_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": ANDROID_UA,
        "X-YouTube-Client-Name": "3",
        "X-YouTube-Client-Version": ANDROID_VERSION,
      },
      body: JSON.stringify({
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
      }),
      signal,
    },
  );
  if (!resp.ok) throw new Error(`InnerTube /player 失败：HTTP ${resp.status}`);
  return (await resp.json()) as PlayerResponse;
}

/** zh > en > 其他；同语言下手动字幕优先于 ASR */
export function pickCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) return null;
  const score = (t: CaptionTrack): number => {
    const lc = (t.languageCode || "").toLowerCase();
    const auto = t.kind === "asr";
    let s = 0;
    if (lc.startsWith("zh")) s += 100;
    else if (lc.startsWith("en")) s += 50;
    else s += 10;
    if (!auto) s += 20;
    return s;
  };
  return [...tracks].sort((a, b) => score(b) - score(a))[0]!;
}
