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
import { PRO_MONTHLY_PRICE, PRO_ANNUAL_PRICE, PRO_TRIAL_DAYS } from '@/lib/proPlan';
import { CLUB_ANNUAL_PRICE, CLUB_DISCOUNT_PERCENT, CLUB_MONTHLY_PRICE, CLUB_TRIAL_LABEL } from '@/lib/clubOffers';
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
//
// trialDays: the free trial this account would get (see
// isEligibleForProTrial) - 0 for someone who has had Pro before. Left out
// where the page doesn't know (the inline ProGate cards), which shows the
// general "new to Pro" line instead; checkout applies the real rule.
//
// club: a club member offer's code (the /club/<code> page) - its 3 free
// months and 10% off replace the usual trial and prices.
export function ProSubscribeButtons({ trialDays, club }: { trialDays?: number; club?: string }) {
  const [loadingInterval, setLoadingInterval] = useState<'monthly' | 'annual' | null>(null);
  const [error, setError] = useState('');

  function subscribe(interval: 'monthly' | 'annual') {
    redirectToUrl(
      '/api/pro/checkout',
      club ? { interval, club } : { interval },
      setError,
      (loading) => setLoadingInterval(loading ? interval : null)
    );
  }

  const busy = loadingInterval !== null;
  const trial = trialDays !== undefined && trialDays > 0;
  const freePeriod = club ? CLUB_TRIAL_LABEL : `${trialDays} days`;
  const monthly = club ? CLUB_MONTHLY_PRICE : PRO_MONTHLY_PRICE;
  const annual = club ? CLUB_ANNUAL_PRICE : PRO_ANNUAL_PRICE;
  const priceNote = club ? `${CLUB_DISCOUNT_PERCENT}% off` : '2 months free';
  const startLabel = club ? `Start ${CLUB_TRIAL_LABEL} free` : 'Start free trial';

  return (
    <>
      {trial ? (
        <p className={styles.planCtaNote} style={{ marginTop: 0 }}>
          Your first {freePeriod} are free. Nothing is charged until the trial ends, we&apos;ll email you a week
          before, and you can cancel any time before then.
        </p>
      ) : trialDays === undefined && PRO_TRIAL_DAYS > 0 ? (
        <p className={styles.planCtaNote} style={{ marginTop: 0 }}>
          New to Pro? Your first {PRO_TRIAL_DAYS} days are free.
        </p>
      ) : null}
      <button type="button" className={styles.planCta + ' ' + styles.planCtaPro} onClick={() => subscribe('monthly')} disabled={busy}>
        {loadingInterval === 'monthly' && <VehicleSpinner size={18} />}
        {loadingInterval === 'monthly'
          ? 'Starting checkout…'
          : trial
            ? `${startLabel} - then ${monthly}/mo`
            : `Subscribe monthly - ${monthly}/mo${club ? ` (${priceNote})` : ''}`}
      </button>
      <button
        type="button"
        className={styles.planCta + ' ' + styles.planCtaSecondary}
        style={{ marginTop: '0.6rem' }}
        onClick={() => subscribe('annual')}
        disabled={busy}
      >
        {loadingInterval === 'annual' && <VehicleSpinner size={18} />}
        {loadingInterval === 'annual'
          ? 'Starting checkout…'
          : trial
            ? `${startLabel} - then ${annual}/yr (${priceNote})`
            : `Subscribe annually - ${annual}/yr (${priceNote})`}
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
