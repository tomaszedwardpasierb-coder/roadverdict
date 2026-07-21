// Place at: src/app/tomasz/RunCronButton.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function RunCronButton({ name, label }: { name: string; label: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleClick() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/run-cron/${name}`, { method: 'POST' });
      const data = await res.json();
      setResult(res.ok ? JSON.stringify(data) : (data.error ?? 'Failed'));
      router.refresh();
    } catch {
      setResult('Could not reach the server.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <button type="button" className="submit-button" onClick={handleClick} disabled={running}>
        {running ? 'Running…' : label}
      </button>
      {result && <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', marginTop: '0.4rem' }}>{result}</p>}
    </div>
  );
}
