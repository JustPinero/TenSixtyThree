/**
 * Phase 69.1 — one SSE reader for every browser consumer (Overseer chat,
 * project command panel). It keeps a carry-over buffer across network
 * chunks, decodes UTF-8 in streaming mode (a multi-byte character split
 * across chunks is not mangled), accepts LF or CRLF framing, joins
 * multi-line `data:` fields, and flushes a final frame that arrived
 * without a trailing blank line. JSON data is parsed; anything else is
 * delivered as a string, never dropped.
 */
export interface SseEvent {
  event: string;
  data: unknown;
}

function parseFrame(frame: string): SseEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const rawLine of frame.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  if (data.length === 0) return null;
  const joined = data.join("\n");
  try {
    return { event, data: JSON.parse(joined) };
  } catch {
    return { event, data: joined };
  }
}

export async function readSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: SseEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const drain = () => {
    buffer = buffer.replace(/\r\n/g, "\n");
    let end = buffer.indexOf("\n\n");
    while (end !== -1) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const parsed = parseFrame(frame);
      if (parsed) onEvent(parsed);
      end = buffer.indexOf("\n\n");
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      drain();
    }
    buffer += decoder.decode();
    drain();
    const tail = parseFrame(buffer);
    if (tail) onEvent(tail);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // already released
    }
  }
}
