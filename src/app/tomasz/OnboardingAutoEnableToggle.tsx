// Place at: src/app/tomasz/OnboardingAutoEnableToggle.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { VehicleSpinner } from '@/components/VehicleSpinner';
import styles from './adminShell.module.css';

// Global, not per-account - the accounts table below still has its own
// EnableOnboardingButton for turning the checklist on for one existing
// account at a time. This is the other lever: whether every brand new
// signup gets it automatically from here on (see createSessionForEmail
// in auth/session.ts, which reads this same setting). Off by default;
// existing accounts are never affected by flipping this either way.
export function OnboardingAutoEnableToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    const next = !enabled;
    if (next && !window.confirm('Turn on the getting-started checklist for every new signup from now on?')) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tomasz/assistant-config/auto-enable-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not update this setting.');
        setLoading(false);
        return;
      }
      router.refresh();
    } catch {
      setError('Could not reach the server.');
      setLoading(false);
    }
  }

  return (
    <div style={{ marginBottom: '0.8rem' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: loading ? 'default' : 'pointer' }}>
        <input type="checkbox" checked={enabled} onChange={handleToggle} disabled={loading} />
        Auto-enable the getting-started checklist for every new signup
        {loading && <VehicleSpinner size={18} />}
      </label>
      <p className={styles.note} style={{ margin: '0.3rem 0 0' }}>
        Off by default. While on, every brand new account gets the checklist the moment it&apos;s created; existing
        accounts are never affected by this either way - enable those individually in the table below.
      </p>
      {error && <p style={{ color: 'var(--admin-danger)', fontSize: '0.78rem', marginTop: '0.3rem' }}>{error}</p>}
    </div>
  );
}
