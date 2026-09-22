'use client';
// Place at: src/components/ProCheckoutButtons.tsx
//
// The only genuinely interactive part of the Free/Pro comparison
// (PlanComparisonCards.tsx) - everything else there is plain
// server-rendered markup. Split out into its own client component so
// that shared one can stay mostly server-renderable, matching
// VdiCheckSection.tsx's own POST-our-route-then-follow-the-returned-url
// pattern rather than introducing Stripe.js/Elements.
import { useState } from 'react';
import { VehicleSpinner } from './VehicleSpinner';
import { PRO_MONTHLY_PRICE, PRO_ANNUAL_PRICE } from '@/lib/proPlan';
import styles from '@/app/pro/pro.module.css';

async function redirectToUrl(
  path: string,
  body: Record<string, string> | undefined,
  setError: (msg: string) => void,
  setLoading: (v: boolean) => void
) {
  setLoading(true);
  setError('');
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok || !data.url) {
      setError(data.error ?? 'Could not start checkout. Please try again.');
      setLoading(false);
      return;
    }
    window.location.href = data.url;
  } catch {
    setError("Couldn't reach the payment service. Please try again.");
    setLoading(false);
  }
}

// Not currently Pro (or a lapsed Pro resubscribing) - two Checkout
// Session buttons, one per Price, rather than a plan toggle, so both
// prices stay visible instead of hidden behind a switch someone has to
// discover first.
export function ProSubscribeButtons() {
  const [loadingInterval, setLoadingInterval] = useState<'monthly' | 'annual' | null>(null);
  const [error, setError] = useState('');

  function subscribe(interval: 'monthly' | 'annual') {
    redirectToUrl(
      '/api/pro/checkout',
      { interval },
      setError,
      (loading) => setLoadingInterval(loading ? interval : null)
    );
  }

  const busy = loadingInterval !== null;

  return (
    <>
      <button type="button" className={styles.planCta + ' ' + styles.planCtaPro} onClick={() => subscribe('monthly')} disabled={busy}>
        {loadingInterval === 'monthly' && <VehicleSpinner size={18} />}
        {loadingInterval === 'monthly' ? 'Starting checkout…' : `Subscribe monthly - ${PRO_MONTHLY_PRICE}/mo`}
      </button>
      <button
        type="button"
        className={styles.planCta + ' ' + styles.planCtaSecondary}
        style={{ marginTop: '0.6rem' }}
        onClick={() => subscribe('annual')}
        disabled={busy}
      >
        {loadingInterval === 'annual' && <VehicleSpinner size={18} />}
        {loadingInterval === 'annual' ? 'Starting checkout…' : `Subscribe annually - ${PRO_ANNUAL_PRICE}/yr (2 months free)`}
      </button>
      {error && <p className="error-text" role="alert">{error}</p>}
    </>
  );
}

// Already Pro via a real Stripe subscription (not an admin grant, which
// has no Stripe Customer to manage) - hands off to Stripe's own hosted
// portal for cancel/switch-plan/update-card/invoices, none of which this
// app implements itself.
export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  return (
    <>
      <button
        type="button"
        className={styles.planCta + ' ' + styles.planCtaSecondary}
        onClick={() => redirectToUrl('/api/pro/billing-portal', undefined, setError, setLoading)}
        disabled={loading}
      >
        {loading ? 'Opening billing portal…' : 'Manage billing'}
      </button>
      {error && <p className="error-text" role="alert">{error}</p>}
    </>
  );
}
