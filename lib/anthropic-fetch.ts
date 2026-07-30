/**
 * Phase 47.2 (partial) — shared POST helper for non-streaming Anthropic
 * Messages calls with retry/backoff. Previously all eight call sites were
 * bare fetch with zero retry: one 429 or transient network blip failed the
 * briefing/harvest/summarize/proposer path outright. Streaming callers are
 * NOT wrapped (mid-stream retry needs different handling; see plan 47.2).
 */
export interface AnthropicPostOptions {
  apiKey: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  maxRetries?: number; // default 2 (3 attempts total)
  retryDelayMs?: number; // base delay, doubles per attempt
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 529]);

export async function postAnthropicWithRetry(
  payload: unknown,
  opts: AnthropicPostOptions
): Promise<Response> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxRetries = opts.maxRetries ?? 2;
  const baseDelay = opts.retryDelayMs ?? 500;

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, baseDelay * 2 ** (attempt - 1)));
    }
    try {
      const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": opts.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(payload),
        signal: opts.signal,
      });
      if (!RETRYABLE.has(res.status) || attempt === maxRetries) return res;
      lastError = null;
    } catch (e) {
      if (opts.signal?.aborted) throw e; // caller cancelled — don't retry
      lastError = e;
      if (attempt === maxRetries) throw e;
    }
  }
  /* istanbul ignore next */
  throw lastError ?? new Error("unreachable");
}
