// 基础流工具：把 ReadableStream<string> 安全抽干为字符串。

export async function drainText(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader();
  let out = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) out += value;
    }
  } finally {
    reader.releaseLock();
  }
  return out;
}

