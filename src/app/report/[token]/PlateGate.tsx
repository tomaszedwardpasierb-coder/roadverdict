// Place at: src/app/report/[token]/PlateGate.tsx
'use client';

import { useState } from 'react';
import styles from './report.module.css';

export function PlateGate({ token }: { token: string }) {
  const [plate, setPlate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/report/${token}/verify-plate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plate }),
      });
      const data = await res.json();
      if (res.ok) {
        window.location.reload();
      } else {
        setError(data.error ?? 'Could not verify. Please try again.');
      }
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.gateBlock}>
        <h1 className={styles.title}>Confirm you have the right bike</h1>
        <p className={styles.subtext}>
          Enter this bike&apos;s registration number to view its RoadVerdict history report. The seller should have
          given you this along with the link.
        </p>
        <form onSubmit={handleSubmit} className={styles.gateForm}>
          <input
            type="text"
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="e.g. AB12 CDE"
            autoCapitalize="characters"
            required
            className={styles.gateInput}
          />
          <button type="submit" className="submit-button" disabled={submitting}>
            {submitting ? 'Checking…' : 'View report'}
          </button>
        </form>
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    </div>
  );
}
