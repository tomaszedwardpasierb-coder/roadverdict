// Place at: src/components/AssistantWidget.tsx
'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Mic } from 'lucide-react';
import { useActiveSection } from './ActiveSectionContext';
import { AssistantProposedEntryCard, type ProposedEntry } from './AssistantProposedEntryCard';
import { AssistantProposedSettingsCard, type ProposedSettingsChange } from './AssistantProposedSettingsCard';
import { AssistantProposedShareLinkCard, type ProposedShareLink } from './AssistantProposedShareLinkCard';
import { VehicleSpinner } from './VehicleSpinner';
import styles from './AssistantWidget.module.css';

// The Web Speech API's SpeechRecognition isn't in TypeScript's default DOM
// lib - it's still non-standard and vendor-prefixed on most browsers
// (webkitSpeechRecognition), not something @types/node or lib.dom.d.ts
// ships. Minimal shape for exactly what's used below, rather than reaching
// for `any` - real browsers implementing this expose a much larger API,
// this only types the slice this component touches.
interface SpeechRecognitionResultLike {
  [index: number]: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

// Voice input is a pure convenience layered on the existing text box - it
// only ever writes into the same `input` state typing already uses, so
// send/retry/validation below needs no changes at all to support it. Not
// supported at all in Firefox, and inconsistently on iOS Safari - the mic
// button simply doesn't render there (see the isSupported check below)
// rather than showing something that wouldn't work.
function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  proposedEntry?: ProposedEntry;
  proposedSettingsChange?: ProposedSettingsChange;
  proposedShareLink?: ProposedShareLink;
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

interface CompareContext {
  vehicleIds: string[];
  from: string | null;
  to: string | null;
}

type SendResult =
  | { ok: true; reply: string; proposedEntry?: ProposedEntry; proposedSettingsChange?: ProposedSettingsChange; proposedShareLink?: ProposedShareLink }
  | { ok: false; error: string; retryable: boolean };

async function attemptSend(
  payload: Message[],
  reportToken: string | null,
  dashboardTab: string | null,
  compareContext: CompareContext | null
): Promise<SendResult> {
  let status: number | null = null;
  try {
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Only role/content (and, if a report page, dashboard tab, or the
      // compare page is open, that context) goes over the wire - nothing
      // else about the user is sent from here; anything the assistant
      // knows about their own account, it gets server-side from their
      // own session, never from this request body. dashboardTab is just
      // the raw Section key (e.g. "shareLinks"), not a label, and
      // compareContext's vehicle ids are just what's currently in this
      // page's own URL - the server independently re-validates both
      // against the real session (bikes AND cars) before trusting
      // either for anything.
      body: JSON.stringify({
        messages: payload.map((m) => ({ role: m.role, content: m.content })),
        ...(reportToken ? { reportToken } : {}),
        ...(dashboardTab ? { dashboardTab } : {}),
        ...(compareContext
          ? {
              compareVehicleIds: compareContext.vehicleIds,
              ...(compareContext.from ? { compareFrom: compareContext.from } : {}),
              ...(compareContext.to ? { compareTo: compareContext.to } : {}),
            }
          : {}),
      }),
    });
    status = res.status;
    const data = await res.json().catch(() => null);
    if (res.ok && data?.reply) {
      return {
        ok: true,
        reply: data.reply,
        ...(data.proposedEntry ? { proposedEntry: data.proposedEntry } : {}),
        ...(data.proposedSettingsChange ? { proposedSettingsChange: data.proposedSettingsChange } : {}),
        ...(data.proposedShareLink ? { proposedShareLink: data.proposedShareLink } : {}),
      };
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

function AssistantWidgetInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reportToken = extractReportToken(pathname ?? '');
  const { activeSection: dashboardTab, vehicleKind } = useActiveSection();
  // Read fresh from the URL on every render rather than stored in state -
  // this only ever needs to reflect whatever's currently on screen, the
  // same "just a hint, server re-validates it" role reportToken already
  // plays above. Only meaningful on this one page; everywhere else it's
  // simply null, same as reportToken/dashboardTab elsewhere.
  const compareContext =
    pathname === '/garage/compare'
      ? { vehicleIds: searchParams.getAll('vehicles'), from: searchParams.get('from'), to: searchParams.get('to') }
      : null;
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
  const [listening, setListening] = useState(false);
  // Starts false and is only ever flipped true from an effect, never
  // computed directly during render - checking `window` synchronously at
  // render time would make the client's first render disagree with the
  // server's (which has no window at all), and React would flag that as a
  // hydration mismatch. Deferring to an effect means both the server and
  // the client's first paint agree ("no mic button yet"), and it only
  // appears once the browser has actually confirmed support.
  const [micSupported, setMicSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMicSupported(getSpeechRecognitionConstructor() !== null);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  // Stop any in-progress recognition on unmount (e.g. closing the panel
  // mid-sentence) - onend below already clears `listening` in the normal
  // case, but the browser wouldn't otherwise know to stop listening just
  // because the component watching it went away.
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function handleMicClick() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-GB';
    recognition.continuous = false;
    recognition.interimResults = true;
    // Writes straight into the same `input` state the textarea already
    // renders and Send already reads from - interim results update it
    // live as you speak, exactly like typing, so nothing downstream
    // (send, retry, validation) needs to know voice was involved at all.
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };
    // "no-speech" (nobody said anything before it timed out) and
    // "aborted" (the person clicked the mic again to stop it themselves)
    // are both normal, silent outcomes, not failures worth surfacing -
    // onend below already resets the listening state either way. Anything
    // else (mic permission denied, no microphone, a real browser error)
    // gets a brief inline note the same way a failed send does.
    recognition.onerror = (event) => {
      const errorEvent = event as Event & { error?: string };
      if (errorEvent.error !== 'no-speech' && errorEvent.error !== 'aborted') {
        setError("Couldn't hear that - check your microphone permission and try again.");
      }
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setListening(true);
    setError(null);
    recognition.start();
  }

  async function sendWithRetry(payload: Message[], reportToken: string | null, dashboardTab: string | null, compareContext: CompareContext | null) {
    setSending(true);
    setError(null);
    setLastFailedMessages(null);

    let result = await attemptSend(payload, reportToken, dashboardTab, compareContext);
    let attempts = 1;
    // Retries silently, still inside the same "sending" state - the
    // person just sees the normal typing indicator for slightly longer
    // if this happens, never a flash of an error that then recovers.
    while (!result.ok && result.retryable && attempts <= MAX_AUTO_RETRIES) {
      await sleep(RETRY_DELAY_MS);
      result = await attemptSend(payload, reportToken, dashboardTab, compareContext);
      attempts++;
    }

    setSending(false);
    if (result.ok) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: result.reply,
          ...(result.proposedEntry ? { proposedEntry: result.proposedEntry } : {}),
          ...(result.proposedSettingsChange ? { proposedSettingsChange: result.proposedSettingsChange } : {}),
          ...(result.proposedShareLink ? { proposedShareLink: result.proposedShareLink } : {}),
        },
      ]);
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
    await sendWithRetry(nextMessages, reportToken, dashboardTab, compareContext);
  }

  function handleRetry() {
    if (!lastFailedMessages || sending) return;
    void sendWithRetry(lastFailedMessages, reportToken, dashboardTab, compareContext);
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
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div className={m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant}>{m.content}</div>
                {m.proposedEntry && <AssistantProposedEntryCard entry={m.proposedEntry} />}
                {m.proposedSettingsChange && <AssistantProposedSettingsCard change={m.proposedSettingsChange} />}
                {m.proposedShareLink && <AssistantProposedShareLinkCard link={m.proposedShareLink} />}
              </div>
            ))}
            {sending && (
              <div className={styles.bubbleAssistant}>
                <VehicleSpinner kind={vehicleKind ?? 'bike'} size={18} />
              </div>
            )}
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
              placeholder={listening ? 'Listening…' : 'Ask about using RoadVerdict…'}
              rows={1}
              disabled={sending}
            />
            {micSupported && (
              <button
                type="button"
                className={listening ? styles.micBtnActive : styles.micBtn}
                onClick={handleMicClick}
                disabled={sending}
                aria-label={listening ? 'Stop voice input' : 'Start voice input'}
                aria-pressed={listening}
              >
                <Mic size={18} />
              </button>
            )}
            <button type="button" className={styles.sendBtn} onClick={handleSend} disabled={sending || !input.trim()}>
              {sending && <VehicleSpinner kind={vehicleKind ?? 'bike'} size={20} />}
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

// useSearchParams() (needed for the compare-page context above) opts a
// component out of static rendering unless it's wrapped in Suspense -
// this widget is mounted once, globally, in the root layout, so without
// this wrapper every single page in the app (including fully static
// public ones) would lose static rendering just for this one page's
// worth of context. fallback=null is fine here: before hydration
// finishes this widget renders nothing visible anyway.
export function AssistantWidget() {
  return (
    <Suspense fallback={null}>
      <AssistantWidgetInner />
    </Suspense>
  );
}
