// Place at: src/app/report/[token]/RequestHistoryCta.tsx
'use client';

import { useState } from 'react';
import styles from './report.module.css';

interface Props {
  registration: string;
  signedInEmail: string | null;
}

export function RequestHistoryCta({ registration, signedInEmail }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleRequest() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/tracker/bike-transfer/request-ownership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registration }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not send the request. Try again.');
        return;
      }
      setSent(true);
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className={styles.upcomingBlock}>
        <p className={styles.upcomingTitle}>Request sent</p>
        <p className={styles.upcomingNote}>
          If the current owner approves it, this bike&apos;s history moves to your account, and you&apos;ll get an
          email either way.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.upcomingBlock}>
      <p className={styles.upcomingTitle}>Bought this bike? Keep its history alive.</p>
      <p className={styles.upcomingNote}>
        Everything above is real, logged history - not guesswork. If you&apos;ve bought this bike, you can carry
        that same record forward under your own free RoadVerdict account, instead of starting from a blank page.
        It&apos;s what will make your eventual buyer trust this bike too, the same way you just did.
      </p>
      {signedInEmail ? (
        <button type="button" className="btn-primary" disabled={submitting} onClick={handleRequest} style={{ marginTop: '0.6rem' }}>
          {submitting ? 'Sending…' : "Request this bike's history"}
        </button>
      ) : (
        <p className={styles.upcomingNote} style={{ marginTop: '0.4rem' }}>
          <a href="/login">Sign in or create a free account</a>, then come back to this page to request it.
        </p>
      )}
      {error && <p className="error-text" role="alert" style={{ marginTop: '0.6rem' }}>{error}</p>}
    </div>
  );
}
