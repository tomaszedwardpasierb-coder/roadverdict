// Place at: src/app/tomasz/ImpersonateButton.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './adminShell.module.css';
export function ImpersonateButton({ email }: { email: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function handleClick() {
    if (!window.confirm(`View the app as ${email}? You'll be logged in as this account until you exit impersonation.`)) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tomasz/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not start impersonation.');
        setLoading(false);
        return;
      }
      router.push('/dashboard');
    } catch {
      setError('Could not reach the server.');
      setLoading(false);
    }
  }
  return (
    <span>
      <button type="button" className={`${styles.button} ${styles.buttonSmall}`} onClick={handleClick} disabled={loading}>
        {loading ? '\u2026' : 'Impersonate'}
      </button>
      {error && <span style={{ color: 'var(--admin-danger)', fontSize: '0.72rem', marginLeft: '0.4rem' }}>{error}</span>}
    </span>
  );
}
