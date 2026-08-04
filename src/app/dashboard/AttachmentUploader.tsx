// Place at: src/app/dashboard/AttachmentUploader.tsx
'use client';

import { useState } from 'react';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';
import { AttachmentThumb } from './AttachmentThumb';
import styles from './dashboard.module.css';

interface Props {
  value: Attachment | null;
  onChange: (attachment: Attachment | null) => void;
  idSuffix?: string;
  // When provided, the receipt just uploaded is cross-checked against
  // these values (read once, at the moment the upload finishes - if the
  // person changes cost or date afterward, the check doesn't re-run
  // automatically, since re-checking on every keystroke would mean
  // calling the AI far more than this is worth). A best-effort nudge,
  // never a block - a failed or skipped check simply shows nothing.
  compareValues?: { cost: number; date: string };
}

// One attachment per record, by design - matches how these get logged in
// practice (one purchase, one receipt). The record's `attachments` field is
// an array for future flexibility, but nothing in this UI currently offers
// more than one at a time.
export function AttachmentUploader({ value, onChange, idSuffix = '', compareValues }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [discrepancies, setDiscrepancies] = useState<string[]>([]);
  const inputId = `attachment-upload${idSuffix}`;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setDiscrepancies([]);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/tracker/upload-attachment', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Upload failed. Try again.');
        return;
      }
      onChange(data.attachment);

      if (compareValues) {
        setVerifying(true);
        try {
          const verifyRes = await fetch('/api/tracker/verify-receipt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              blobName: data.attachment.blobName,
              expectedCost: compareValues.cost,
              expectedDate: compareValues.date,
            }),
          });
          const verifyData = await verifyRes.json();
          if (verifyRes.ok && Array.isArray(verifyData.discrepancies)) {
            setDiscrepancies(verifyData.discrepancies);
          }
        } catch {
          // Silent - this is a best-effort nudge, not a required step.
        } finally {
          setVerifying(false);
        }
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="field" style={{ marginTop: '0.9rem' }}>
      <label htmlFor={inputId}>Receipt or invoice (optional)</label>
      {value ? (
        <div className={styles.attachmentChip}>
          <AttachmentThumb attachment={value} />
          <span className={styles.attachmentFileName}>{value.fileName}</span>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => {
              onChange(null);
              setDiscrepancies([]);
            }}
            disabled={uploading}
          >
            Remove
          </button>
        </div>
      ) : (
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          onChange={handleFileChange}
          disabled={uploading}
        />
      )}
      {uploading && <p className="field-note">Uploading…</p>}
      {verifying && <p className="field-note">🧠 Double-checking against what you entered…</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
      {discrepancies.length > 0 && (
        <div className={styles.receiptDiscrepancyNote}>
          🧠 {discrepancies.map((d, i) => (
            <p key={i} style={{ margin: i === 0 ? 0 : '0.3rem 0 0' }}>{d}</p>
          ))}
        </div>
      )}
    </div>
  );
}
