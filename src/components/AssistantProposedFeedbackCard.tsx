// Place at: src/components/AssistantProposedFeedbackCard.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchWithTimeout, FetchTimeoutError, UPLOAD_TIMEOUT_MS } from '@/lib/fetchWithTimeout';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';
import styles from './AssistantProposedEntryCard.module.css';

export interface ProposedFeedback {
  category: 'feedback';
  feedbackType: 'feature' | 'bug' | 'other';
  message: string;
}

const MAX_ATTACHMENTS = 3;

const TYPE_OPTIONS: { value: ProposedFeedback['feedbackType']; label: string }[] = [
  { value: 'feature', label: 'Feature request' },
  { value: 'bug', label: 'Bug report' },
  { value: 'other', label: 'Other feedback' },
];

// Files are picked here, at confirm time - not pre-uploaded on pick the
// way AssistantWidget's own single receipt-attachment does - and
// uploaded to a dedicated route (/api/account/feedback/upload-attachment,
// PNG/JPG only) that's deliberately separate from both the tracker's
// generic attachment endpoint and the Vault's own. "Send feedback" then
// posts to the exact same /api/account/feedback endpoint the manual
// Settings form uses, so an admin sees one unified list regardless of
// which surface a submission came from.
export function AssistantProposedFeedbackCard({ feedback }: { feedback: ProposedFeedback }) {
  const router = useRouter();
  const [feedbackType, setFeedbackType] = useState(feedback.feedbackType);
  const [message, setMessage] = useState(feedback.message);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function handleFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ''; // lets picking the same file again after removing it still fire onChange
    if (files.length + picked.length > MAX_ATTACHMENTS) {
      setError(`Up to ${MAX_ATTACHMENTS} screenshots allowed.`);
      return;
    }
    setError(null);
    setFiles((prev) => [...prev, ...picked]);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleConfirm() {
    if (!message.trim()) {
      setError('Enter a message first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const attachments: Attachment[] = [];
      if (feedbackType === 'bug') {
        for (const file of files) {
          const fd = new FormData();
          fd.set('file', file);
          const res = await fetchWithTimeout('/api/account/feedback/upload-attachment', { method: 'POST', body: fd }, UPLOAD_TIMEOUT_MS);
          const data = await res.json();
          if (!res.ok) {
            setError(data.error ?? 'One of the screenshots failed to upload. Please try again.');
            setSubmitting(false);
            return;
          }
          attachments.push(data.attachment);
        }
      }

      const res = await fetch('/api/account/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: feedbackType, message: message.trim(), attachments, source: 'assistant' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? 'Could not send this. Try again.');
        setSubmitting(false);
        return;
      }
      setSent(true);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof FetchTimeoutError
          ? 'That took too long - try again.'
          : 'Could not reach RoadVerdict. Check your connection and try again.'
      );
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className={styles.card}>
        <p className={styles.loggedNote}>✓ Sent - thanks for letting us know.</p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <span className={styles.cardLabel}>
        {feedbackType === 'bug' ? 'Bug report' : feedbackType === 'feature' ? 'Feature request' : 'Feedback'}
      </span>

      <div className={styles.field}>
        <label htmlFor="ai-feedback-type">Type</label>
        <select
          id="ai-feedback-type"
          value={feedbackType}
          onChange={(e) => setFeedbackType(e.target.value as ProposedFeedback['feedbackType'])}
          disabled={submitting}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="ai-feedback-message">Message</label>
        <textarea
          id="ai-feedback-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={submitting}
          rows={3}
        />
      </div>

      {feedbackType === 'bug' && (
        <div className={styles.field}>
          <label htmlFor="ai-feedback-attachments">Screenshots (PNG/JPG, up to {MAX_ATTACHMENTS}, optional)</label>
          <input
            id="ai-feedback-attachments"
            type="file"
            accept="image/png,image/jpeg"
            multiple
            onChange={handleFilesPicked}
            disabled={submitting || files.length >= MAX_ATTACHMENTS}
          />
          {files.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.4rem' }}>
              {files.map((file, i) => (
                <span key={`${file.name}-${i}`} style={{ fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  {file.name}
                  <button type="button" onClick={() => removeFile(i)} disabled={submitting} aria-label={`Remove ${file.name}`} style={{ cursor: 'pointer' }}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className={styles.errorNote} role="alert">{error}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.confirmBtn} onClick={handleConfirm} disabled={submitting}>
          {submitting ? 'Sending…' : 'Send feedback'}
        </button>
      </div>
    </div>
  );
}
