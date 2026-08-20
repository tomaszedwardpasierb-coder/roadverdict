// Place at: src/app/dashboard/TransferOwnershipSection.tsx
'use client';

import { useState } from 'react';
import styles from './dashboard.module.css';

interface PendingRequest {
  recipientEmail: string;
  createdAt: string;
  includeRecords?: boolean;
}

interface Props {
  pendingRequest: PendingRequest | null;
  bikeIsReadOnly: boolean;
}

export function TransferOwnershipSection({ pendingRequest, bikeIsReadOnly }: Props) {
  const [email, setEmail] = useState('');
  const [includeRecords, setIncludeRecords] = useState(true);
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
        body: JSON.stringify({ recipientEmail: cleaned, includeRecords }),
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
      <div className={styles.card}>
        <p className={styles.subtext}>This bike has already been transferred and can&apos;t be offered again.</p>
      </div>
    );
  }

  const activeRequest = sentTo
    ? { recipientEmail: sentTo, createdAt: new Date().toISOString(), includeRecords }
    : pendingRequest;

  return (
    <div className={styles.card}>
      {activeRequest ? (
        <p className={styles.subtext}>
          Waiting for <strong>{activeRequest.recipientEmail}</strong> to accept - offered{' '}
          {new Date(activeRequest.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.
          Once accepted, this bike moves to their account and your copy becomes read-only.{' '}
          {activeRequest.includeRecords === false
            ? "Your individual service records, fuel logs, mods, bills, and any attached receipts stay private on your own account - only the bike's identity and a summary go with it."
            : "Your logged service records, fuel logs, mods, bills, and any attached receipts go with it too."}
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
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginTop: '0.8rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeRecords}
              onChange={(e) => setIncludeRecords(e.target.checked)}
              style={{ marginTop: '0.2rem' }}
            />
            <span className="field-note">
              Include my logged service records, fuel logs, mods, bills, and any attached receipts. If unchecked,
              only the bike&apos;s identity and a summary transfer - your individual records stay private on your
              own account.
            </span>
          </label>
          {error && <p className="error-text" role="alert" style={{ marginTop: '0.6rem' }}>{error}</p>}
        </>
      )}
    </div>
  );
}
