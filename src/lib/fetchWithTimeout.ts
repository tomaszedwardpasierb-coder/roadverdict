// Place at: src/lib/fetchWithTimeout.ts
//
// No fetch to an external service anywhere in this codebase had a
// timeout - if GOV.UK, Frankfurter, or Azure Log Analytics ever stalls
// (connection open, no response), the calling request hangs
// indefinitely. That's exactly the symptom commit 6953eeb fixed for the
// cron-button self-fetch deadlock, except this is a second, different
// cause of the same "Running…" forever appearance: the admin route no
// longer deadlocks on itself, but a cron handler it calls can still hang
// on one of these real external calls. A plain AbortController wrapper,
// applied at every such call site, closes that gap - and, since this file
// is also used for client-side uploads (upload-attachment, Vault
// documents), it distinguishes a genuine timeout as FetchTimeoutError so
// those callers can show "timed out, try again" rather than the generic
// "could not reach the server" message a real network failure gets.
const DEFAULT_TIMEOUT_MS = 15_000;

// 10MB is this app's own upload cap (upload-attachment/route.ts,
// vault/documents/route.ts) - long enough for that on a genuinely slow
// mobile connection, short enough that nobody's left staring at a spinner
// for minutes with no way out.
export const UPLOAD_TIMEOUT_MS = 45_000;

export class FetchTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = "FetchTimeoutError";
  }
}

export async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    // Only re-labelled when the abort was actually ours - a signal the
    // caller passed in themselves (none currently do) could also land
    // here, and that's a real abort, not a timeout.
    if (controller.signal.aborted) throw new FetchTimeoutError(timeoutMs);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
