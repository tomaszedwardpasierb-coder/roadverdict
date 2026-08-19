// Place at: src/app/dashboard/TransferOwnershipSection.tsx
'use client';

import { useState } from 'react';
import styles from './dashboard.module.css';

interface PendingRequest {
  recipientEmail: string;
  createdAt: string;
}

interface Props {
  pendingRequest: PendingRequest | null;
  bikeIsReadOnly: boolean;
}

export function TransferOwnershipSection({ pendingRequest, bikeIsReadOnly }: Props) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit() {
    const cleaned = email.trim();
    if (!cleaned || !cleaned.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/tracker/bike-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientEmail: cleaned }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not start the handover. Try again.');
        return;
      }
      setSentTo(cleaned);
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (bikeIsReadOnly) {
    return (
      <div className={styles.card} style={{ marginTop: '1.4rem' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Transfer ownership</h2>
        <p className={styles.subtext}>This bike has already been transferred and can&apos;t be offered again.</p>
      </div>
    );
  }

  const activeRequest = sentTo ? { recipientEmail: sentTo, createdAt: new Date().toISOString() } : pendingRequest;

  return (
    <div className={styles.card} style={{ marginTop: '1.4rem' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Transfer ownership</h2>
      {activeRequest ? (
        <p className={styles.subtext}>
          Waiting for <strong>{activeRequest.recipientEmail}</strong> to accept - offered{' '}
          {new Date(activeRequest.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.
          Once accepted, this bike moves to their account and your copy becomes read-only.
        </p>
      ) : (
        <>
          <p className={styles.subtext}>
            Selling this bike? Hand the buyer your logged history instead of them starting fresh - service records,
            mileage, and documentation, continuing under their own account.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="buyer@example.com"
              style={{ flex: '1 1 200px' }}
            />
            <button type="button" className="btn-primary" disabled={submitting} onClick={handleSubmit}>
              {submitting ? 'Sending…' : 'Start handover'}
            </button>
          </div>
          {error && <p className="error-text" role="alert" style={{ marginTop: '0.6rem' }}>{error}</p>}
        </>
      )}
    </div>
  );
}
