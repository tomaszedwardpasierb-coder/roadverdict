// Place at: src/app/dashboard/IncomingOwnershipRequestCard.tsx
'use client';

import { useState } from 'react';
import styles from './dashboard.module.css';

interface Props {
  requestId: string;
  requesterEmail: string;
  createdAt: string;
}

export function IncomingOwnershipRequestCard({ requestId, requesterEmail, createdAt }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<'approved' | 'declined' | null>(null);

  async function handleDecision(decision: 'approve' | 'decline') {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tracker/bike-transfer/incoming/${requestId}/${decision}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Try again.');
        return;
      }
      setResult(decision === 'approve' ? 'approved' : 'declined');
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result === 'approved') {
    return (
      <div className={styles.card}>
        <p className={styles.subtext}>
          Approved. This bike now belongs to {requesterEmail}&apos;s account, and your own copy is now read-only.
        </p>
      </div>
    );
  }
  if (result === 'declined') {
    return (
      <div className={styles.card}>
        <p className={styles.subtext}>Declined. Nothing has changed - this bike is still fully yours.</p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <p className={styles.subtext}>
        <strong>{requesterEmail}</strong> has requested this bike&apos;s RoadVerdict history - requested{' '}
        {new Date(createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}. If
        you&apos;ve sold them this bike, approving hands over its logged history and makes your own copy read-only.
      </p>
      <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.8rem' }}>
        <button type="button" className="btn-primary" disabled={submitting} onClick={() => handleDecision('approve')}>
          {submitting ? 'Please wait…' : 'Approve'}
        </button>
        <button type="button" className="btn-secondary" disabled={submitting} onClick={() => handleDecision('decline')}>
          {submitting ? 'Please wait…' : 'Decline'}
        </button>
      </div>
      {error && <p className="error-text" role="alert" style={{ marginTop: '0.6rem' }}>{error}</p>}
    </div>
  );
}
