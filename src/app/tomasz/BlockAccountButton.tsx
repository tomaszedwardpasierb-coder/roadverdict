// Place at: src/app/tomasz/BlockAccountButton.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './adminShell.module.css';

export function BlockAccountButton({ email, blocked }: { email: string; blocked: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    const nextBlocked = !blocked;
    const confirmMessage = nextBlocked
      ? `Block ${email}? They'll be signed out immediately and won't be able to sign back in until unblocked.`
      : `Unblock ${email}? They'll be able to sign in again.`;
    if (!window.confirm(confirmMessage)) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tomasz/accounts/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, blocked: nextBlocked }),
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

  return (
    <span>
      <button type="button" className={`${styles.button} ${styles.buttonSmall}`} onClick={handleClick} disabled={loading}>
        {loading ? '…' : blocked ? 'Unblock' : 'Block'}
      </button>
      {error && <span style={{ color: 'var(--admin-danger)', fontSize: '0.72rem', marginLeft: '0.4rem' }}>{error}</span>}
    </span>
  );
}
