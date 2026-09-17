// Place at: src/app/tomasz/EnableOnboardingButton.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { VehicleSpinner } from '@/components/VehicleSpinner';
import styles from './adminShell.module.css';

// For an account that existed before the onboarding checklist shipped
// (see UserDoc.onboarding's own comment in userDoc.ts) - every brand new
// account gets it automatically now, so this only ever matters for
// accounts already in this table. Idempotent server-side, so there's
// nothing to undo here and no "disable" counterpart.
export function EnableOnboardingButton({ email, enabled }: { email: string; enabled: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!window.confirm(`Turn on the getting-started checklist for ${email}?`)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tomasz/accounts/enable-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not update this account.');
        setLoading(false);
        return;
      }
      router.refresh();
    } catch {
      setError('Could not reach the server.');
      setLoading(false);
    }
  }

  if (enabled) return <span style={{ color: 'var(--admin-success)', fontSize: '0.78rem' }}>On</span>;

  return (
    <span>
      <button type="button" className={`${styles.button} ${styles.buttonSmall}`} onClick={handleClick} disabled={loading}>
        {loading && <VehicleSpinner size={20} />}
        {loading ? '…' : 'Enable'}
      </button>
      {error && <span style={{ color: 'var(--admin-danger)', fontSize: '0.72rem', marginLeft: '0.4rem' }}>{error}</span>}
    </span>
  );
}
