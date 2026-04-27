// 极简结构化日志：CF Workers 控制台天然 JSON 友好；不要引 winston/pino。
// 上层用 logger.with({ requestId }) 拿到一个带上下文的子 logger。

type Level = "info" | "warn" | "error";

export interface Logger {
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  with(fields: Record<string, unknown>): Logger;
}

function emit(level: Level, msg: string, base: Record<string, unknown>, extra?: Record<string, unknown>): void {
  const line = JSON.stringify({ level, msg, ...base, ...extra, ts: Date.now() });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function makeLogger(base: Record<string, unknown> = {}): Logger {
  return {
    info: (m, f) => emit("info", m, base, f),
    warn: (m, f) => emit("warn", m, base, f),
    error: (m, f) => emit("error", m, base, f),
    with: (fields) => makeLogger({ ...base, ...fields }),
  };
}

export const logger: Logger = makeLogger();
