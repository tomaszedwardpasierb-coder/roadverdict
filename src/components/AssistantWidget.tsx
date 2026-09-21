// Place at: src/components/AssistantWidget.tsx
'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Mic, Paperclip, X } from 'lucide-react';
import { useActiveSection } from './ActiveSectionContext';
import { AssistantProposedEntryCard, type ProposedEntry } from './AssistantProposedEntryCard';
import { AssistantProposedSettingsCard, type ProposedSettingsChange } from './AssistantProposedSettingsCard';
import { AssistantProposedShareLinkCard, type ProposedShareLink } from './AssistantProposedShareLinkCard';
import { AssistantProposedVaultDocumentCard, type ProposedVaultDocument } from './AssistantProposedVaultDocumentCard';
import { AssistantProposedFeedbackCard, type ProposedFeedback } from './AssistantProposedFeedbackCard';
import { AttachmentThumb } from '@/app/dashboard/AttachmentThumb';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';
import { fetchWithTimeout, FetchTimeoutError, UPLOAD_TIMEOUT_MS } from '@/lib/fetchWithTimeout';
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

// What each Web Speech API error code actually means - previously every
// non-silent error (network failure reaching the browser's speech
// service, no microphone present, the service being unavailable at all)
// was shown as the same "check your microphone permission" message,
// which is only actually true for `not-allowed`. On a real network
// restriction (the most common cause in practice - Chrome's built-in
// recognition talks to a Google backend, so any firewall/DNS-level block
// surfaces as `network` even with a working, permitted mic), that
// message sent people checking a permission that was never the problem.
// See https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognitionErrorEvent/error
// for the full code list.
const SPEECH_ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': "Microphone access is blocked - allow it in your browser's site settings and try again.",
  'service-not-allowed': "Voice input isn't available in this browser right now - try typing instead.",
  'audio-capture': 'No microphone found - check one is connected and try again.',
  'network': "Couldn't reach the voice service - check your connection and try again.",
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
  // Set on a user message that had a file attached when sent - already
  // uploaded by then (see handleAttachmentPick), so this is only ever a
  // real Attachment reference, shown as a small thumbnail on that
  // message's own bubble.
  attachment?: Attachment;
  proposedEntry?: ProposedEntry;
  proposedSettingsChange?: ProposedSettingsChange;
  proposedShareLink?: ProposedShareLink;
  proposedVaultDocument?: ProposedVaultDocument;
  proposedFeedback?: ProposedFeedback;
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
// How long voice input waits after the last new word before sending on
// its own - long enough for a normal pause mid-sentence, short enough
// that it doesn't feel like it's just hanging there once you've stopped.
const VOICE_SILENCE_AUTOSEND_MS = 5000;

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
  | {
      ok: true;
      reply: string;
      proposedEntry?: ProposedEntry;
      proposedSettingsChange?: ProposedSettingsChange;
      proposedShareLink?: ProposedShareLink;
      proposedVaultDocument?: ProposedVaultDocument;
      proposedFeedback?: ProposedFeedback;
    }
  | { ok: false; error: string; retryable: boolean };

async function attemptSend(
  payload: Message[],
  reportToken: string | null,
  dashboardTab: string | null,
  compareContext: CompareContext | null,
  attachment: Attachment | null
): Promise<SendResult> {
  let status: number | null = null;
  try {
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Only role/content (and, if a report page, dashboard tab, the
      // compare page, or an attached file, that context) goes over the
      // wire - nothing else about the user is sent from here; anything
      // the assistant knows about their own account, it gets
      // server-side from their own session, never from this request
      // body. dashboardTab is just the raw Section key (e.g.
      // "shareLinks"), not a label, and compareContext's vehicle ids are
      // just what's currently in this page's own URL - the server
      // independently re-validates both against the real session (bikes
      // AND cars) before trusting either for anything. attachment is
      // just the reference already returned by uploading the file
      // moments ago (see handleAttachmentPick) - never the file itself.
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
        ...(attachment ? { attachment } : {}),
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
        ...(data.proposedVaultDocument ? { proposedVaultDocument: data.proposedVaultDocument } : {}),
        ...(data.proposedFeedback ? { proposedFeedback: data.proposedFeedback } : {}),
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
  // Whatever was already in the box (typed, or left over from an earlier
  // voice segment) at the moment the CURRENT recognition session started -
  // onresult below prepends this so restarting the mic to add more by
  // voice appends onto it instead of overwriting it.
  const voiceBaseTextRef = useRef('');
  // Cleared/rescheduled on every onresult, and on any manual edit - see
  // handleMicClick, handleInputChange and handleInputFocus below.
  const autoSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // handleSend is redefined on every render (it closes over `input` and
  // other state), but the auto-send timer is scheduled from inside
  // recognition.onresult, itself created once per mic session and never
  // redefined on re-render - calling a directly-closed-over handleSend
  // from that timer would call a stale copy. Kept in sync via the effect
  // below instead, so the timer always calls whichever handleSend is
  // actually current.
  const latestHandleSendRef = useRef<() => void>(() => {});
  const listRef = useRef<HTMLDivElement>(null);
  // Already uploaded (see handleAttachmentPick) by the time it's
  // "pending" - a real Attachment reference, not a raw File, ready to
  // send with the next message. Cleared once that message is sent.
  const [pendingAttachment, setPendingAttachment] = useState<Attachment | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

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
      if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current);
    };
  }, []);

  function clearAutoSendTimer() {
    if (autoSendTimerRef.current) {
      clearTimeout(autoSendTimerRef.current);
      autoSendTimerRef.current = null;
    }
  }

  function handleMicClick() {
    if (listening) {
      // Reset immediately rather than waiting on the browser's own onend
      // event - stop() asks the recognition session to end, but nothing
      // guarantees it actually fires onend promptly (or at all, on some
      // browsers/error paths), which is exactly what left the mic button
      // stuck pulsing with no way to cancel it. A manual stop-click never
      // auto-sends on its own - only the silence timer below does that;
      // this just leaves whatever's been said so far in the box to review.
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setListening(false);
      clearAutoSendTimer();
      return;
    }
    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor) return;

    // Whatever's already in the box - typed, or left over from an earlier
    // voice segment - becomes the prefix onresult below builds onto, so
    // clicking the mic again to add more by voice appends onto it
    // instead of replacing it outright.
    voiceBaseTextRef.current = input;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-GB';
    // true, not false - this session keeps listening across pauses
    // instead of the browser silently ending it on its own
    // (unconfigurable, inconsistent-length) idea of "done talking". The
    // 5-second silence timer below is what actually decides when to stop
    // and send, on purpose - one clear, predictable rule instead of
    // whatever a given browser happens to do.
    recognition.continuous = true;
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
      const base = voiceBaseTextRef.current;
      setInput(base ? `${base} ${transcript}` : transcript);

      // Rescheduled on every new word recognized - only a real 5-second
      // gap with nothing new said triggers the auto-send, not 5 seconds
      // from whenever listening merely started.
      clearAutoSendTimer();
      autoSendTimerRef.current = setTimeout(() => {
        autoSendTimerRef.current = null;
        if (recognitionRef.current !== recognition) return; // superseded or already stopped
        recognitionRef.current.stop();
        recognitionRef.current = null;
        setListening(false);
        latestHandleSendRef.current();
      }, VOICE_SILENCE_AUTOSEND_MS);
    };
    // "no-speech" (nobody said anything before it timed out) and
    // "aborted" (the person clicked the mic again to stop it themselves)
    // are both normal, silent outcomes, not failures worth surfacing -
    // onend below already resets the listening state either way.
    recognition.onerror = (event) => {
      const errorEvent = event as Event & { error?: string };
      const code = errorEvent.error ?? '';
      if (code !== 'no-speech' && code !== 'aborted') {
        setError(SPEECH_ERROR_MESSAGES[code] ?? "Couldn't hear that - try again.");
      }
    };
    // Guarded by identity - if a later session has already replaced this
    // one in recognitionRef (e.g. stop-then-restart in quick succession),
    // this stale onend must not reset state for the session that's
    // actually still running now.
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      setListening(false);
      recognitionRef.current = null;
      clearAutoSendTimer();
    };

    recognitionRef.current = recognition;
    setError(null);
    try {
      recognition.start();
      setListening(true);
    } catch {
      // start() can throw synchronously (e.g. a session already winding
      // down) - without this, that left `listening` never set true in
      // the first place, but recognitionRef pointing at a dead object,
      // so a follow-up click's stop() was a no-op and the button read as
      // permanently stuck.
      recognitionRef.current = null;
      setError("Couldn't start voice input - try again.");
    }
  }

  // Uploads immediately on pick, same as AttachmentUploader.tsx's own
  // manual-form flow - by the time it's "pending" this already IS a
  // real Attachment reference (blobName etc.), never a raw File held in
  // state waiting to be sent, so a chat-drafted entry's own confirm step
  // needs no upload of its own (see AssistantProposedEntryCard.tsx).
  async function handleAttachmentPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAttachmentError(null);
    setUploadingAttachment(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetchWithTimeout(
        '/api/tracker/upload-attachment',
        { method: 'POST', body: formData },
        UPLOAD_TIMEOUT_MS
      );
      const data = await res.json();
      if (!res.ok) {
        setAttachmentError(data.error ?? 'Upload failed. Try again.');
        return;
      }
      setPendingAttachment(data.attachment);
    } catch (err) {
      setAttachmentError(err instanceof FetchTimeoutError ? 'Upload timed out - try again.' : 'Could not reach the server.');
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function sendWithRetry(payload: Message[], reportToken: string | null, dashboardTab: string | null, compareContext: CompareContext | null) {
    setSending(true);
    setError(null);
    setLastFailedMessages(null);

    // Always the newest user message's own attachment (or none) - every
    // caller below passes a payload ending in the message that was just
    // added, whether this is a fresh send or a retry of one that failed.
    const attachment = payload[payload.length - 1]?.attachment ?? null;

    let result = await attemptSend(payload, reportToken, dashboardTab, compareContext, attachment);
    let attempts = 1;
    // Retries silently, still inside the same "sending" state - the
    // person just sees the normal typing indicator for slightly longer
    // if this happens, never a flash of an error that then recovers.
    while (!result.ok && result.retryable && attempts <= MAX_AUTO_RETRIES) {
      await sleep(RETRY_DELAY_MS);
      result = await attemptSend(payload, reportToken, dashboardTab, compareContext, attachment);
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
          ...(result.proposedVaultDocument ? { proposedVaultDocument: result.proposedVaultDocument } : {}),
          ...(result.proposedFeedback ? { proposedFeedback: result.proposedFeedback } : {}),
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

    // Stop any still-active voice session before clearing the box below -
    // stop() is asynchronous, so a trailing onresult landing right after
    // the box is cleared would otherwise silently refill it with
    // already-sent speech.
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setListening(false);
    }
    if (autoSendTimerRef.current) {
      clearTimeout(autoSendTimerRef.current);
      autoSendTimerRef.current = null;
    }

    const nextMessages: Message[] = [
      ...messages,
      { role: 'user', content: text, ...(pendingAttachment ? { attachment: pendingAttachment } : {}) },
    ];
    setMessages(nextMessages);
    setInput('');
    setPendingAttachment(null);
    setAttachmentError(null);
    await sendWithRetry(nextMessages, reportToken, dashboardTab, compareContext);
  }

  // Runs after every render, keeping the ref the voice auto-send timer
  // calls always pointed at the freshest handleSend - see
  // latestHandleSendRef's own comment above.
  useEffect(() => {
    latestHandleSendRef.current = handleSend;
  });

  // Fired once, from AssistantProposedEntryCard, right after a real
  // confirm succeeds - closes the gap where logging several things in
  // one request ("log an oil change and a new tyre") drafted the first
  // one, and then just sat there once it was confirmed, needing the
  // person to type something themselves to get the second one drafted.
  // A genuine, visible follow-up turn through the normal send pipeline
  // (not a hidden message) - the model already has the original request
  // in its own context, so it can tell whether there's really another
  // item left to draft or the whole thing's done; see the "MULTI-ITEM
  // LOGGING" system-instruction block in assistant/route.ts for how it's
  // told to handle this specific message.
  async function continueAfterEntryConfirmed() {
    if (sending) return;
    const text = "That's logged. If there's anything else from what I just asked you to log, draft the next one now.";
    const nextMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
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

  // Taking manual control of the box - by typing, or just by clicking/
  // tabbing into it - cancels any pending voice auto-send so it can't
  // fire out from under a genuinely-manual edit. Recognition itself (if
  // still running) is left alone: a fresh onresult reschedules the timer
  // again on its own once there's something new to hear, same as ever.
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    clearAutoSendTimer();
  }

  function handleInputFocus() {
    clearAutoSendTimer();
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
                {m.attachment && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <AttachmentThumb attachment={m.attachment} />
                    <span style={{ fontSize: '0.75rem' }}>{m.attachment.fileName}</span>
                  </div>
                )}
                {m.proposedEntry && <AssistantProposedEntryCard entry={m.proposedEntry} onConfirmed={continueAfterEntryConfirmed} />}
                {m.proposedSettingsChange && <AssistantProposedSettingsCard change={m.proposedSettingsChange} />}
                {m.proposedShareLink && <AssistantProposedShareLinkCard link={m.proposedShareLink} />}
                {m.proposedVaultDocument && <AssistantProposedVaultDocumentCard document={m.proposedVaultDocument} />}
                {m.proposedFeedback && <AssistantProposedFeedbackCard feedback={m.proposedFeedback} />}
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

          {(pendingAttachment || uploadingAttachment || attachmentError) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}>
              {uploadingAttachment && (
                <>
                  <VehicleSpinner kind={vehicleKind ?? 'bike'} size={14} /> Uploading…
                </>
              )}
              {pendingAttachment && !uploadingAttachment && (
                <>
                  <AttachmentThumb attachment={pendingAttachment} />
                  <span>{pendingAttachment.fileName}</span>
                  <button
                    type="button"
                    onClick={() => setPendingAttachment(null)}
                    aria-label="Remove attachment"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}
                  >
                    <X size={14} />
                  </button>
                </>
              )}
              {attachmentError && <span className={styles.errorNote}>{attachmentError}</span>}
            </div>
          )}

          <div className={styles.inputRow}>
            <input
              ref={attachmentInputRef}
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              onChange={handleAttachmentPick}
              aria-label="Choose a photo or file to attach"
              hidden
            />
            <button
              type="button"
              className={styles.micBtn}
              onClick={() => attachmentInputRef.current?.click()}
              disabled={sending || uploadingAttachment}
              aria-label="Attach a photo or file"
            >
              <Paperclip size={18} />
            </button>
            <textarea
              className={styles.input}
              value={input}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
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
        {open ? '✕' : <img src="/assistant-icon.webp" alt="" width={28} height={28} className={styles.launcherIcon} />}
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
