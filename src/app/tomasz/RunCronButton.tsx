// Place at: src/app/tomasz/RunCronButton.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './adminShell.module.css';
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
      // Pretty-printed rather than a single unformatted line - the
      // previous version, run against a real backfill returning dozens
      // of per-item entries, spilled out well past its own card with
      // no wrapping or scroll boundary at all.
      setResult(res.ok ? JSON.stringify(data, null, 2) : (data.error ?? 'Failed'));
      router.refresh();
    } catch {
      setResult('Could not reach the server.');
    } finally {
      setRunning(false);
    }
  }
  return (
    <div>
      <button type="button" className={styles.button} onClick={handleClick} disabled={running}>
        {running ? 'Running\u2026' : label}
      </button>
      {result && <div className={styles.jsonBlock}>{result}</div>}
    </div>
  );
}
