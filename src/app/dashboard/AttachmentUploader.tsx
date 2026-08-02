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
}

// One attachment per record, by design - matches how these get logged in
// practice (one purchase, one receipt). The record's `attachments` field is
// an array for future flexibility, but nothing in this UI currently offers
// more than one at a time.
export function AttachmentUploader({ value, onChange, idSuffix = '' }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = `attachment-upload${idSuffix}`;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
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
          <button type="button" className={styles.iconBtn} onClick={() => onChange(null)} disabled={uploading}>
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
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}
