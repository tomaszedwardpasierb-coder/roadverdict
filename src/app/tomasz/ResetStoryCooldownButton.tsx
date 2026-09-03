// Place at: src/app/tomasz/ResetStoryCooldownButton.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './adminShell.module.css';

export function ResetStoryCooldownButton({ email }: { email: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!window.confirm(`Let ${email} regenerate their Story So Far right now, ignoring the usual 7-day cooldown?`)) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tomasz/reset-story-cooldown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not reset the cooldown.');
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
        {loading ? '…' : 'Unlock Story regen'}
      </button>
      {error && <span style={{ color: 'var(--admin-danger)', fontSize: '0.72rem', marginLeft: '0.4rem' }}>{error}</span>}
    </span>
  );
}
