// Place at: src/app/dashboard/RefreshVehicleDataButton.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { VehicleSpinner } from '@/components/VehicleSpinner';
import styles from './dashboard.module.css';

interface Props {
  bikeId: string;
  // Server-computed from the bike's own lastRefreshedAt (see bike.ts's
  // canRefreshBikeData/nextBikeDataRefreshAt) - the button is only ever
  // shown when a refresh is actually allowed; otherwise this component
  // shows the next-available date instead, never a disabled button.
  available: boolean;
  nextAvailableAt: string | null;
}

export function RefreshVehicleDataButton({ bikeId, available, nextAvailableAt }: Props) {
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
      // Shown either way, not just for SORN - a taxed vehicle gets a
      // plain confirmation instead of the refresh looking like it
      // silently skipped the tax check entirely.
      if (data.sorned) {
        parts.push('⚠️ this vehicle is currently SORN (not taxed) - see reminders below');
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
        {loading && <VehicleSpinner kind="bike" size={20} />}
        {loading ? 'Refreshing…' : 'Refresh vehicle data'}
      </button>
      {result && (
        <p className="field-note" style={{ marginTop: '0.3rem', fontSize: '0.72rem' }}>{result}</p>
      )}
    </div>
  );
}
