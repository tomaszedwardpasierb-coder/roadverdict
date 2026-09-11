// Place at: src/app/dashboard/RefreshCarDataButton.tsx
// Car equivalent of RefreshVehicleDataButton.tsx - same mechanic, just
// posts carId to the car refresh-data route.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { VehicleSpinner } from '@/components/VehicleSpinner';
import styles from './dashboard.module.css';

interface Props {
  carId: string;
  // Server-computed from the car's own lastRefreshedAt (see car.ts's
  // canRefreshCarData/nextCarDataRefreshAt) - mirrors
  // RefreshVehicleDataButton.tsx's own props exactly.
  available: boolean;
  nextAvailableAt: string | null;
}

export function RefreshCarDataButton({ carId, available, nextAvailableAt }: Props) {
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
      if (data.taxBillLogged) parts.push('road tax logged as an expense');
      setResult(parts.length > 0 ? parts.join(', ') + '.' : 'Checked - nothing new to add.');
      router.refresh();
    } catch {
      setResult('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }

  if (!available) {
    return (
      <p className="field-note" style={{ fontSize: '0.72rem' }}>
        Refresh available again{nextAvailableAt ? ` on ${new Date(nextAvailableAt).toLocaleDateString('en-GB')}` : ' soon'}.
      </p>
    );
  }

  return (
    <div>
      <button type="button" className={styles.iconBtn} onClick={handleClick} disabled={loading}>
        {loading && <VehicleSpinner kind="car" size={14} />}
        {loading ? 'Refreshing…' : 'Refresh vehicle data'}
      </button>
      {result && (
        <p className="field-note" style={{ marginTop: '0.3rem', fontSize: '0.72rem' }}>{result}</p>
      )}
    </div>
  );
}
