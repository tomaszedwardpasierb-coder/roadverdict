// Place at: src/app/tomasz/FeedbackTable.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './adminShell.module.css';
import type { FeedbackDoc, FeedbackStatus } from '@/lib/tracker/feedback';

function fmtDate(d: string): string {
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_OPTIONS: FeedbackStatus[] = ['new', 'reviewed', 'resolved'];
const TYPE_LABELS: Record<FeedbackDoc['feedbackType'], string> = {
  feature: 'Feature request',
  bug: 'Bug report',
  other: 'Other',
};

function StatusSelect({ id, status }: { id: string; status: FeedbackStatus }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [saving, setSaving] = useState(false);

  async function handleChange(next: FeedbackStatus) {
    setValue(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/tomasz/feedback/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <select value={value} onChange={(e) => handleChange(e.target.value as FeedbackStatus)} disabled={saving} aria-label="Status">
      {STATUS_OPTIONS.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

// Attachments are viewed as plain links to the admin-only serving route
// (/api/tomasz/feedback-attachment/[blobName]), not an inline <img> - the
// tracker's own AttachmentThumb component points at a different route
// (/api/tracker/attachment/[blobName]) whose ownership check a
// FeedbackDoc's attachments would never pass (see that route's own
// comment on why a separate admin route exists at all).
export function FeedbackTable({ items }: { items: FeedbackDoc[] }) {
  if (items.length === 0) {
    return <p className={styles.warnNote}>No feedback submitted yet.</p>;
  }

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Submitted</th>
          <th>Type</th>
          <th>From</th>
          <th>Message</th>
          <th>Attachments</th>
          <th>Source</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {items.map((f) => (
          <tr key={f.id}>
            <td>{fmtDate(f.submittedAt)}</td>
            <td>{TYPE_LABELS[f.feedbackType]}</td>
            <td>{f.email}</td>
            <td style={{ maxWidth: '360px', whiteSpace: 'pre-wrap' }}>{f.message}</td>
            <td>
              {f.attachments && f.attachments.length > 0
                ? f.attachments.map((a, i) => (
                    <a
                      key={a.blobName}
                      href={`/api/tomasz/feedback-attachment/${encodeURIComponent(a.blobName)}`}
                      target="_blank"
                      rel="noopener"
                      style={{ display: 'block' }}
                    >
                      {a.fileName || `Screenshot ${i + 1}`}
                    </a>
                  ))
                : '-'}
            </td>
            <td>{f.source}</td>
            <td><StatusSelect id={f.id} status={f.status} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
