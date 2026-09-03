// Place at: src/app/tomasz/GrantPremiumForm.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './adminShell.module.css';

// Mirrors userAccount.ts's own MAX_GRANT_YEARS - only used here to
// give the date input a sensible max attribute for a better click
// experience. The real cap is enforced server-side in grantPremium()
// itself; this is not the security boundary.
const MAX_GRANT_YEARS = 3;

function maxAllowedDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + MAX_GRANT_YEARS);
  return d.toISOString().slice(0, 10);
}

interface Props {
  email: string;
  plan: { expiresAt: string } | null;
}

export function GrantPremiumForm({ email, plan }: Props) {
  const router = useRouter();
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGrant() {
    if (!expiresAt) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tomasz/accounts/grant-premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, expiresAt: new Date(expiresAt).toISOString() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not grant Premium.');
        setLoading(false);
        return;
      }
      router.refresh();
    } catch {
      setError('Could not reach the server.');
      setLoading(false);
    }
  }

  async function handleRevoke() {
    if (!window.confirm(`Revoke Premium from ${email} immediately?`)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tomasz/accounts/revoke-premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not revoke Premium.');
        setLoading(false);
        return;
      }
      router.refresh();
    } catch {
      setError('Could not reach the server.');
      setLoading(false);
    }
  }

  if (plan) {
    const daysLeft = Math.max(0, Math.ceil((new Date(plan.expiresAt).getTime() - Date.now()) / 86_400_000));
    return (
      <span>
        <strong>Premium</strong> - {daysLeft} day{daysLeft === 1 ? '' : 's'} left
        <button
          type="button"
          className={`${styles.button} ${styles.buttonSmall}`}
          onClick={handleRevoke}
          disabled={loading}
          style={{ marginLeft: '0.5rem' }}
        >
          {loading ? '…' : 'Revoke'}
        </button>
        {error && <span style={{ color: 'var(--admin-danger)', fontSize: '0.72rem', marginLeft: '0.4rem' }}>{error}</span>}
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center' }}>
      <input
        type="date"
        aria-label={`Premium expiry date for ${email}`}
        value={expiresAt}
        onChange={(e) => setExpiresAt(e.target.value)}
        max={maxAllowedDate()}
        min={new Date().toISOString().slice(0, 10)}
        className={styles.input}
        style={{ padding: '0.2rem', fontSize: '0.75rem', width: '9rem' }}
      />
      <button type="button" className={`${styles.button} ${styles.buttonSmall}`} onClick={handleGrant} disabled={loading || !expiresAt}>
        {loading ? '…' : 'Grant'}
      </button>
      {error && <span style={{ color: 'var(--admin-danger)', fontSize: '0.72rem' }}>{error}</span>}
    </span>
  );
}
