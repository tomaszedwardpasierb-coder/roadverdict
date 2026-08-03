// Place at: src/app/dashboard/RegistrationBackfillBanner.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './dashboard.module.css';

export function RegistrationBackfillBanner({ bikeName }: { bikeName: string }) {
  const router = useRouter();
  const [registration, setRegistration] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!registration.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/tracker/bike/set-original-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registration }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.registrationBanner}>
      <p className={styles.registrationBannerTitle}>One more thing for {bikeName}: add its registration</p>
      <p>
        To make sure a pre-sale report is genuinely tied to this exact bike - not just to whatever&apos;s typed into a
        form - every bike now needs its registration on record. This becomes the bike&apos;s permanent original
        registration: it can&apos;t be removed later, only added to if the plate genuinely changes later on (for
        example, a private plate).
      </p>
      <p style={{ marginTop: '0.5rem' }}>
        Please enter the real registration rather than a placeholder or random characters - once it&apos;s saved,
        it&apos;s locked in, the same way a registration stays tied to a vehicle&apos;s own record with the DVLA.
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.6rem', marginTop: '0.9rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="e.g. AB12 CDE"
          value={registration}
          onChange={(e) => setRegistration(e.target.value)}
          style={{ textTransform: 'uppercase', flex: 1, minWidth: '160px' }}
          required
        />
        <button type="submit" className="submit-button" disabled={submitting} style={{ width: 'auto' }}>
          {submitting ? 'Saving…' : 'Save registration'}
        </button>
      </form>
      {error && <p className="error-text" role="alert" style={{ marginTop: '0.5rem' }}>{error}</p>}
    </div>
  );
}
