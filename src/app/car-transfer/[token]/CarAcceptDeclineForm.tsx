// Place at: src/app/car-transfer/[token]/CarAcceptDeclineForm.tsx
// Car mirror of bike-transfer/[token]/AcceptDeclineForm.tsx.
'use client';

import { useState } from 'react';
import { VehicleSpinner } from '@/components/VehicleSpinner';
import styles from '../../report/[token]/report.module.css';

interface Props {
  token: string;
  status: 'pending' | 'accepted' | 'declined';
  recipientEmail: string;
  signedInEmail: string | null;
}

export function CarAcceptDeclineForm({ token, status, recipientEmail, signedInEmail }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<'accepted' | 'declined' | null>(null);

  async function handleDecision(decision: 'accept' | 'decline') {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/cars/car-transfer/${token}/${decision}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Try again.');
        return;
      }
      setResult(decision === 'accept' ? 'accepted' : 'declined');
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result === 'accepted') {
    return (
      <div className={styles.wrapper} style={{ padding: 0 }}>
        <p className={styles.subtext}>
          Accepted. This car now appears on your account, and the previous owner&apos;s copy is now read-only.{' '}
          <a href="/dashboard">Go to your dashboard</a>.
        </p>
      </div>
    );
  }
  if (result === 'declined') {
    return (
      <div className={styles.wrapper} style={{ padding: 0 }}>
        <p className={styles.subtext}>Declined. Nothing has changed on either account.</p>
      </div>
    );
  }

  if (status !== 'pending') {
    return (
      <div className={styles.wrapper} style={{ padding: 0 }}>
        <p className={styles.subtext}>This offer has already been {status}.</p>
      </div>
    );
  }

  const declineButton = (
    <button type="button" className="btn-secondary" disabled={submitting} onClick={() => handleDecision('decline')}>
      {submitting && <VehicleSpinner kind="car" size={14} />}
      {submitting ? 'Please wait…' : 'Decline'}
    </button>
  );

  if (!signedInEmail) {
    return (
      <div className={styles.wrapper} style={{ padding: 0 }}>
        <p className={styles.subtext}>
          Sign in or create a RoadVerdict account using <strong>{recipientEmail}</strong> to accept this, then come
          back to this same link. <a href="/login">Sign in</a>.
        </p>
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.8rem' }}>{declineButton}</div>
        {error && <p className="error-text" role="alert" style={{ marginTop: '0.6rem' }}>{error}</p>}
      </div>
    );
  }

  if (signedInEmail !== recipientEmail) {
    return (
      <div className={styles.wrapper} style={{ padding: 0 }}>
        <p className={styles.subtext}>
          This offer was sent to <strong>{recipientEmail}</strong>, but you&apos;re signed in as{' '}
          <strong>{signedInEmail}</strong>. Sign out and sign back in with that address to accept.
        </p>
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.8rem' }}>{declineButton}</div>
        {error && <p className="error-text" role="alert" style={{ marginTop: '0.6rem' }}>{error}</p>}
      </div>
    );
  }

  return (
    <div className={styles.wrapper} style={{ padding: 0 }}>
      <div style={{ display: 'flex', gap: '0.6rem' }}>
        <button type="button" className="btn-primary" disabled={submitting} onClick={() => handleDecision('accept')}>
          {submitting && <VehicleSpinner kind="car" size={14} />}
          {submitting ? 'Please wait…' : 'Accept'}
        </button>
        {declineButton}
      </div>
      {error && <p className="error-text" role="alert" style={{ marginTop: '0.6rem' }}>{error}</p>}
    </div>
  );
}
