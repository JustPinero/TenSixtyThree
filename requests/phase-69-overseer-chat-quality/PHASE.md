# Phase 69 — Overseer chat quality

Source: deep review (F7, F8, F12, F27, A6, A7, A11-A14).

## 69.1 — Streaming that cannot lose or fake text
- Shared client SSE reader with a carry-over buffer (overseer-chat +
  command-panel). Server accumulator: throw on `error` frames and on a
  stream that ends without `message_stop`; never execute a tool_use whose
  input never closed; preserve `redacted_thinking` blocks.
- Branch on `stop_reason` (`max_tokens`, `refusal`, `pause_turn`); truncation
  reason reported accurately (iteration cap vs timeout vs abort).
- Retry 429/529/5xx before first byte (shared retry helper); create-tools
  idempotent per session.
## 69.2 — Rendering and input
- Replies through `ui/Markdown` (+ code fences, links); textarea with
  Shift+Enter; `role="log"` + polite live region; stick-to-bottom only when
  already at bottom; draft survives a failed send; visible retry.
- Briefing: error state + retry instead of disappearing.
## 69.3 — History
- One POST per turn in a transaction (ordered); client passes local date;
  delete the unused history compressor or key it by content hash + user.
- Wizard `templateContent` length cap.

## AC → tests
- SSE reader: every split point of a fixture stream yields identical text.
- Accumulator: error frame → throws; truncated tool_use → not executed.
- stop_reason matrix; retry-before-first-byte; duplicate create suppressed.
- Component tests: markdown rendered, multi-line paste preserved, scroll
  position kept while reading back.
