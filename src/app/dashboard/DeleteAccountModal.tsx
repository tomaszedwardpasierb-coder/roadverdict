// Place at: src/app/dashboard/DeleteAccountModal.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './dashboard.module.css';

export function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = confirmText === 'DELETE';

  async function handleConfirm() {
    if (!canConfirm) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/account/request-deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not schedule deletion. Please try again.');
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError('Could not reach RoadVerdict. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="delete-account-title" className={styles.reviewQueueOverlay} onClick={onClose}>
      <div className={styles.reviewQueueModal} style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
        <h2 id="delete-account-title" style={{ marginTop: 0 }}>Delete your account?</h2>
        <p className={styles.subtext}>
          This schedules your account, and everything logged on it - every bike or car, service
          history, receipts, everything - for permanent deletion in 30 days. Nothing is deleted
          today. You&apos;ll get an email confirming the exact date, and you can cancel any time
          before then by signing in and clicking &quot;Cancel deletion&quot; - after that date, this can&apos;t
          be undone.
        </p>
        <div className="field" style={{ marginTop: '1rem' }}>
          <label htmlFor="delete-account-confirm">Type <strong>DELETE</strong> to confirm</label>
          <input
            id="delete-account-confirm"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoFocus
            style={{ width: '100%', maxWidth: '260px', padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '4px' }}
          />
        </div>
        {error && <p className="error-text" role="alert" style={{ marginTop: '0.6rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.2rem' }}>
          <button
            type="button"
            className={styles.iconBtn}
            style={{ borderColor: 'var(--verdict-red)', color: 'var(--verdict-red)' }}
            disabled={!canConfirm || submitting}
            onClick={handleConfirm}
          >
            {submitting ? 'Scheduling…' : 'Delete my account'}
          </button>
          <button type="button" className={styles.iconBtn} onClick={onClose} disabled={submitting}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
