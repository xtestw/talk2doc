// 我方对前端的 SSE 协议
//   event: <kind>
//   data: <JSON-encoded string>
//   \n
// kind ∈ "status" | "chunk" | "error" | "done"

export type SseKind = "status" | "chunk" | "error" | "done";

const enc = new TextEncoder();

export function encodeEvent(kind: SseKind, data: string): Uint8Array {
  return enc.encode(`event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * 通用上游 SSE 拆帧器：按 \n\n 切事件。
 * Gemini / OpenAI 的 stream 协议都是这种形态，复用避免重复。
 */
export function sseEventSplitter(): TransformStream<string, string> {
  let buf = "";
  return new TransformStream({
    transform(chunk, ctrl) {
      buf += chunk;
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
