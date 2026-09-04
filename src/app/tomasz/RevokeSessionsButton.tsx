// Place at: src/app/tomasz/RevokeSessionsButton.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './adminShell.module.css';

export function RevokeSessionsButton({ email }: { email: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    const confirmMessage = `Force ${email} to re-authenticate? They'll be signed out of every device immediately and need to sign in again next time.`;
    if (!window.confirm(confirmMessage)) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tomasz/accounts/revoke-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not revoke sessions.');
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
    <span>
      <button type="button" className={`${styles.button} ${styles.buttonSmall}`} onClick={handleClick} disabled={loading}>
        {loading ? '…' : 'Force re-auth'}
      </button>
      {error && <span style={{ color: 'var(--admin-danger)', fontSize: '0.72rem', marginLeft: '0.4rem' }}>{error}</span>}
    </span>
  );
}
