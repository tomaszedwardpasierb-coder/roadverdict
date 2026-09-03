// Place at: src/app/dashboard/ProGate.tsx
//
// Wraps any Pro-only section. When the user isn't on Pro, renders the
// same Free vs Pro comparison shown on /pro instead of the real content -
// one subscription unlocks every locked feature together, so the gate
// shouldn't look like this one feature has its own separate price.
'use client';

import { PlanComparisonCards } from '@/components/PlanComparisonCards';
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
      <p className={styles.proGateUnlockNote}>
        One Pro subscription unlocks every locked feature across RoadVerdict together, not just this one.
      </p>
      <div style={{ width: '100%' }}>
        <PlanComparisonCards userIsPro={false} showFreeCta={false} />
      </div>
    </div>
  );
}
