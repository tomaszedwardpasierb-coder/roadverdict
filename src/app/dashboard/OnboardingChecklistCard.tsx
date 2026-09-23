// Place at: src/app/dashboard/OnboardingChecklistCard.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { VehicleSpinner } from '@/components/VehicleSpinner';
import { ONBOARDING_STEPS } from '@/lib/tracker/onboardingSteps';
import styles from './OnboardingChecklistCard.module.css';

interface Props {
  completedSteps: string[];
  dismissed: boolean;
}

// Only ever rendered when the account's own UserDoc.onboarding field is
// present at all (see the call sites in page.tsx) - an account created
// before this feature shipped never sees this, unless an admin turns it
// on for them via /tomasz's EnableOnboardingButton. Each item is ticked
// by the real action actually happening server-side (see
// markOnboardingStepComplete's call sites across the log-entry routes,
// the assistant route, the share-link routes, and the compare page, plus
// useMarkOnboardingStepSeen for the two steps with no request of their
// own to hook into) - never by a "mark as done" click here.
export function OnboardingChecklistCard({ completedSteps, dismissed: initialDismissed }: Props) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(initialDismissed);
  const [loading, setLoading] = useState(false);
  const doneCount = ONBOARDING_STEPS.filter((s) => completedSteps.includes(s.step)).length;
  const allDone = doneCount === ONBOARDING_STEPS.length;

  async function toggleDismissed(next: boolean) {
    setLoading(true);
    setDismissed(next);
    try {
      await fetch('/api/onboarding/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dismissed: next }),
      });
      router.refresh();
    } catch {
      // Best-effort - worst case the card's open/collapsed state doesn't
      // survive a refresh, nothing else depends on this succeeding.
    } finally {
      setLoading(false);
    }
  }

  if (dismissed) {
    return (
      <button type="button" className={styles.onboardingPill} onClick={() => toggleDismissed(false)} disabled={loading}>
        {loading && <VehicleSpinner size={14} />}
        Getting started ({doneCount}/{ONBOARDING_STEPS.length}) · show again
      </button>
    );
  }

  return (
    <div className={styles.onboardingCard}>
      <div className={styles.onboardingHeader}>
        <p className={styles.onboardingTitle}>{allDone ? "You're all set!" : 'Getting started'}</p>
        <span className={styles.onboardingProgress}>{doneCount} of {ONBOARDING_STEPS.length} done</span>
        <button type="button" className={styles.onboardingHideBtn} onClick={() => toggleDismissed(true)} disabled={loading}>
          Hide
        </button>
      </div>
      <ul className={styles.onboardingList}>
        {ONBOARDING_STEPS.map(({ step, label, href }) => {
          const done = completedSteps.includes(step);
          return (
            <li key={step} className={done ? `${styles.onboardingItem} ${styles.onboardingItemDone}` : styles.onboardingItem}>
              <span className={done ? `${styles.onboardingTick} ${styles.onboardingTickDone}` : styles.onboardingTick}>
                {done ? '✓' : ''}
              </span>
              <Link href={href} className={styles.onboardingItemLink}>{label}</Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
