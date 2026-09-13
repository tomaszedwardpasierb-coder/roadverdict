// Place at: src/lib/fetchWithTimeout.ts
//
// No fetch to an external service anywhere in this codebase had a
// timeout - if GOV.UK, Frankfurter, or Azure Log Analytics ever stalls
// (connection open, no response), the calling request hangs
// indefinitely. That's exactly the symptom commit 6953eeb fixed for the
// cron-button self-fetch deadlock, except this is a second, different
// cause of the same "Running…" forever appearance: the admin route no
// longer deadlocks on itself, but a cron handler it calls can still hang
// on one of these real external calls. A plain AbortSignal.timeout()
// wrapper, applied at every such call site, closes that gap.
const DEFAULT_TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}
