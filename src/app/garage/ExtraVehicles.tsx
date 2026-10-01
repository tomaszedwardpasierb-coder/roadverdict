// Place at: src/app/garage/ExtraVehicles.tsx
//
// Buying and dropping extra vehicles (£1.99/month each, on top of Pro's
// two) - see src/lib/payments/extraVehicles.ts. Website only.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { EXTRA_VEHICLE_MONTHLY_PRICE } from '@/lib/proPlan';

async function post(action: 'add' | 'remove'): Promise<{ url?: string; error?: string }> {
  try {
    const res = await fetch('/api/pro/extra-vehicles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? 'Something went wrong. Please try again.' };
    return { url: data.url };
  } catch {
    return { error: 'Could not reach the server.' };
  }
}

export function AddExtraVehicleButton({ paid }: { paid: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    // Only the first one goes through Stripe's own checkout page - after
    // that the card already on file is charged straight away, so say so.
    if (paid > 0 && !window.confirm(`Add another vehicle for ${EXTRA_VEHICLE_MONTHLY_PRICE}/month? Your card on file is charged now for the rest of this month.`)) return;
    setLoading(true);
    setError(null);
    const result = await post('add');
    if (result.url) {
      window.location.href = result.url;
      return;
    }
    setLoading(false);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <p style={{ marginTop: '0.7rem', marginBottom: 0 }}>
      <button type="button" className="submit-button" onClick={handleClick} disabled={loading}>
        {loading ? 'One moment…' : `Add a vehicle - ${EXTRA_VEHICLE_MONTHLY_PRICE}/month`}
      </button>
      {error && <span role="alert" style={{ display: 'block', color: 'var(--danger, #b42318)', marginTop: '0.4rem' }}>{error}</span>}
    </p>
  );
}

export function ExtraVehiclesSummary({ paid }: { paid: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRemove() {
    if (!window.confirm("Stop paying for one extra vehicle? It ends now, with no refund for this month - you won't be charged for it again.")) return;
    setLoading(true);
    setError(null);
    const result = await post('remove');
    setLoading(false);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <p className="field-note" style={{ marginTop: '1rem' }}>
      You pay for {paid} extra vehicle{paid === 1 ? '' : 's'} ({EXTRA_VEHICLE_MONTHLY_PRICE}/month each).{' '}
      <button
        type="button"
        onClick={handleRemove}
        disabled={loading}
        style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
      >
        {loading ? 'Removing…' : 'Remove one'}
      </button>
      {error && <span role="alert" style={{ display: 'block', color: 'var(--danger, #b42318)', marginTop: '0.4rem' }}>{error}</span>}
    </p>
  );
}
