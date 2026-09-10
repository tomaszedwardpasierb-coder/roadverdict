// Place at: src/app/dashboard/RefreshCarDataButton.tsx
// Car equivalent of RefreshVehicleDataButton.tsx - same mechanic, just
// posts carId to the car refresh-data route.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './dashboard.module.css';

export function RefreshCarDataButton({ carId }: { carId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/cars/car/refresh-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult(data.error ?? 'Could not refresh right now.');
        return;
      }
      const parts: string[] = [];
      if (data.dvlaRefreshed) parts.push('vehicle data updated');
      if (data.motCreated > 0) parts.push(`${data.motCreated} new MOT test${data.motCreated === 1 ? '' : 's'} logged`);
      // Shown either way, not just for SORN - see the bike button's own
      // equivalent comment.
      if (data.sorned) {
        parts.push('⚠️ this car is currently SORN (not taxed) - see reminders below');
      } else if (data.taxStatus) {
        parts.push(
          `tax status: ${data.taxStatus}${data.taxDueDate ? ` (due ${new Date(data.taxDueDate).toLocaleDateString('en-GB')})` : ''}`
        );
      }
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
