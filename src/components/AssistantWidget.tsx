// Place at: src/components/AssistantWidget.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import styles from './AssistantWidget.module.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const GREETING: Message = {
  role: 'assistant',
  content: "Hi - I can help with anything about using RoadVerdict: logging a receipt, checking your spend, whatever you're trying to do. What can I help with?",
};

// Matches /report/<token> or /report/<token>/detailed - the two pages
// a share link actually resolves to. Deliberately excludes
// /report/receipt-request/..., the one other route under /report/ that
// isn't a share-token page at all. This is only ever a hint to the
// server about which page is open - the server independently verifies
// the token is real and that this browser has actually passed that
// report's plate-gate before trusting it for anything (see route.ts).
function extractReportToken(pathname: string): string | null {
  const match = pathname.match(/^\/report\/([^/]+)(?:\/detailed)?\/?$/);
  if (!match) return null;
  const token = match[1];
  if (token === 'receipt-request') return null;
  return token;
}

// One silent automatic retry beyond the first attempt - most failures
// here are a brief blip (a transient network drop, or Gemini itself
// returning a momentary 502), and the person should never see an error
// for something that resolves itself a second later. Only retried
// automatically (or offered a manual retry) when the failure looks
// transient in the first place - see isRetryable below.
const MAX_AUTO_RETRIES = 1;
const RETRY_DELAY_MS = 1200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A 4xx means the request itself was the problem - too long, or
// malformed - and resending the exact same thing would just fail the
// same way again. Only a 5xx (something genuinely went wrong server
// side, or Gemini itself is temporarily down) or a network failure
// that never reached the server at all are worth retrying.
function isRetryable(status: number | null): boolean {
  return status === null || status >= 500;
}

type SendResult = { ok: true; reply: string } | { ok: false; error: string; retryable: boolean };

async function attemptSend(payload: Message[], reportToken: string | null): Promise<SendResult> {
  let status: number | null = null;
  try {
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Only role/content (and, if a report page is open, that report's
      // token) goes over the wire - nothing else about the user is sent
      // from here; anything the assistant knows about their own
      // account, it gets server-side from their own session, never
      // from this request body.
      body: JSON.stringify({
        messages: payload.map((m) => ({ role: m.role, content: m.content })),
        ...(reportToken ? { reportToken } : {}),
      }),
    });
    status = res.status;
    const data = await res.json().catch(() => null);
    if (res.ok && data?.reply) {
      return { ok: true, reply: data.reply };
    }
    return {
      ok: false,
      error: data?.error ?? "Couldn't reach the assistant just now.",
      retryable: isRetryable(status),
    };
  } catch {
    // A genuine network failure - the request never got a response at
    // all, which is exactly the kind of thing worth retrying.
    return { ok: false, error: "Couldn't reach the assistant just now.", retryable: true };
  }
}

export function AssistantWidget() {
  const pathname = usePathname();
  const reportToken = extractReportToken(pathname ?? '');
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The exact payload that failed, kept only when the failure looked
  // retryable - lets "Retry" resend precisely what didn't go through
  // without the person needing to retype anything. Never set for a
  // non-retryable failure (e.g. message too long), since resending the
  // same thing there would just fail identically - the only real fix
  // in that case is a different message, typed fresh.
  const [lastFailedMessages, setLastFailedMessages] = useState<Message[] | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  async function sendWithRetry(payload: Message[], reportToken: string | null) {
    setSending(true);
    setError(null);
    setLastFailedMessages(null);

    let result = await attemptSend(payload, reportToken);
    let attempts = 1;
    // Retries silently, still inside the same "sending" state - the
    // person just sees the normal typing indicator for slightly longer
    // if this happens, never a flash of an error that then recovers.
    while (!result.ok && result.retryable && attempts <= MAX_AUTO_RETRIES) {
      await sleep(RETRY_DELAY_MS);
      result = await attemptSend(payload, reportToken);
      attempts++;
    }

    setSending(false);
    if (result.ok) {
      setMessages((prev) => [...prev, { role: 'assistant', content: result.reply }]);
    } else {
      setError(result.retryable ? `${result.error} Try again.` : result.error);
      if (result.retryable) setLastFailedMessages(payload);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    const nextMessages = [...messages, { role: 'user' as const, content: text }];
    setMessages(nextMessages);
    setInput('');
    await sendWithRetry(nextMessages, reportToken);
  }

  function handleRetry() {
    if (!lastFailedMessages || sending) return;
    void sendWithRetry(lastFailedMessages, reportToken);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div data-assistant-widget className={styles.wrap}>
      {open && (
        <div className={styles.panel} role="dialog" aria-label="RoadVerdict assistant">
          <div className={styles.header}>
            <span className={styles.headerTitle}>RoadVerdict Assistant</span>
            <button type="button" className={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </button>
          </div>

          <div className={styles.messages} ref={listRef}>
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant}>
                {m.content}
              </div>
            ))}
            {sending && <div className={styles.bubbleAssistant}>…</div>}
            {error && (
              <div className={styles.errorNote}>
                {error}
                {lastFailedMessages && (
                  <button type="button" className="submit-button" style={{ marginTop: '0.5rem' }} onClick={handleRetry} disabled={sending}>
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>

          <div className={styles.inputRow}>
            <textarea
              className={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about using RoadVerdict…"
              rows={1}
              disabled={sending}
            />
            <button type="button" className={styles.sendBtn} onClick={handleSend} disabled={sending || !input.trim()}>
              Send
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className={styles.launcher}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close assistant' : 'Open assistant'}
      >
        {open ? '✕' : <img src="/assistant-icon.png" alt="" width={28} height={28} className={styles.launcherIcon} />}
      </button>
    </div>
  );
}
