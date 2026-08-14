// Place at: src/app/dashboard/RefreshVehicleDataButton.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './dashboard.module.css';

export function RefreshVehicleDataButton({ bikeId }: { bikeId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/tracker/bike/refresh-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bikeId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult(data.error ?? 'Could not refresh right now.');
        return;
      }
      const parts: string[] = [];
      if (data.dvlaRefreshed) parts.push('vehicle data updated');
      if (data.motCreated > 0) parts.push(`${data.motCreated} new MOT test${data.motCreated === 1 ? '' : 's'} logged`);
      setResult(parts.length > 0 ? parts.join(', ') + '.' : 'Checked - nothing new to add.');
      router.refresh();
    } catch {
      setResult('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button type="button" className={styles.iconBtn} onClick={handleClick} disabled={loading}>
        {loading ? 'Refreshing…' : 'Refresh vehicle data'}
      </button>
      {result && (
        <p className="field-note" style={{ marginTop: '0.3rem', fontSize: '0.72rem' }}>{result}</p>
      )}
    </div>
  );
}
