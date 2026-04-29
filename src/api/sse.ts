// 我方对前端的 SSE 协议
//   event: <kind>
//   data: <JSON-encoded string>
//   \n
// kind ∈ "job" | "status" | "chunk" | "subtitle" | "error" | "done"

export type SseKind = "job" | "status" | "chunk" | "subtitle" | "error" | "done";

const enc = new TextEncoder();

export function encodeEvent(kind: SseKind, data: string): Uint8Array {
  return enc.encode(`event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function encodeEventWithId(seq: number, kind: SseKind, data: string): Uint8Array {
  return enc.encode(`id: ${seq}\nevent: ${kind}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * 通用上游 SSE 拆帧器：按 \n\n 切事件。
 * Gemini / OpenAI 的 stream 协议都是这种形态，复用避免重复。
 */
export function sseEventSplitter(): TransformStream<string, string> {
  let buf = "";
  return new TransformStream({
    transform(chunk, ctrl) {
      // 兼容上游用 CRLF（\r\n）分隔 SSE 行；统一成 LF 后再按 \n\n 拆帧。
      // 直接去掉 \r 也能处理跨 chunk 的 \r + \n 边界。
      buf += chunk.replace(/\r/g, "");
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const evt = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (evt) ctrl.enqueue(evt);
      }
    },
    flush(ctrl) {
      if (buf.trim()) ctrl.enqueue(buf);
    },
  });
}
