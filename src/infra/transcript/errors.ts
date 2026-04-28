export class SubtitleUnavailableError extends Error {
  constructor(message = "该视频没有可用字幕") {
    super(message);
    this.name = "SubtitleUnavailableError";
  }
}

export class SubtitleFetchTransientError extends Error {
  constructor(message = "字幕抓取暂时失败，请稍后重试") {
    super(message);
    this.name = "SubtitleFetchTransientError";
  }
}
