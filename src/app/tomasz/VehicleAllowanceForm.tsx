// Place at: src/app/tomasz/VehicleAllowanceForm.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { VehicleSpinner } from '@/components/VehicleSpinner';
import styles from './adminShell.module.css';

// Mirrors MAX_GRANTED_VEHICLES in vehicleLimit.ts - only the choices
// offered here. setVehicleAllowance() enforces the real range.
const CHOICES = [2, 3, 4];

// How many vehicles this account may track. "Plan" = the plan's own cap
// (1 free, 2 Pro); a number raises it, never lowers it.
export function VehicleAllowanceForm({ email, allowance }: { email: string; allowance: number | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(value: string) {
    const next = value === '' ? null : Number(value);
    const label = next === null ? "the plan's own limit" : `${next} vehicles`;
    if (!window.confirm(`Set ${email} to ${label}?`)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tomasz/accounts/vehicle-allowance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, allowance: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not update the allowance.');
        return;
      }
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <span style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center' }}>
      <select
        aria-label={`Vehicle allowance for ${email}`}
        value={allowance === null ? '' : String(allowance)}
        onChange={(e) => handleChange(e.target.value)}
        disabled={loading}
        className={styles.input}
        style={{ padding: '0.2rem', fontSize: '0.75rem' }}
      >
        <option value="">Plan</option>
        {CHOICES.map((n) => (
          <option key={n} value={n}>{n} vehicles</option>
        ))}
      </select>
      {loading && <VehicleSpinner size={20} />}
      {error && <span style={{ color: 'var(--admin-danger)', fontSize: '0.72rem' }}>{error}</span>}
    </span>
  );
}
