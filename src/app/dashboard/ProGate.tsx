// Place at: src/app/dashboard/ProGate.tsx
//
// Wraps any Pro-only section. When the user isn't on Pro, renders a
// friendly upsell card instead of the real content. The "Upgrade"
// button links to /pro - no payment flow yet, just a pricing page.
// When Stripe is ready, /pro becomes the checkout entry point.
'use client';

import Link from 'next/link';
import styles from './dashboard.module.css';

interface Props {
  featureName: string;
  // A one-sentence description of what this feature does.
  description: string;
  children: React.ReactNode;
  // Pass isPro from the server component that fetched it.
  isPro: boolean;
}

export function ProGate({ featureName, description, children, isPro }: Props) {
  if (isPro) return <>{children}</>;

  return (
    <div className={styles.proGate}>
      <div className={styles.proGateBadge}>Pro</div>
      <h3 className={styles.proGateTitle}>{featureName}</h3>
      <p className={styles.proGateDesc}>{description}</p>
      <Link href="/pro" className={styles.proGateBtn}>
        Upgrade to Pro — £4.99/month
      </Link>
      <p className={styles.proGateAnnual}>
        Or £49/year (saves £10.88 — that&apos;s two months free)
      </p>
    </div>
  );
}
