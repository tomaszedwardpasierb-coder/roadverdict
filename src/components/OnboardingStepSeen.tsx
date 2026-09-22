// Place at: src/components/OnboardingStepSeen.tsx
'use client';

import { useEffect, useRef } from 'react';
import type { OnboardingStep } from '@/lib/tracker/onboardingSteps';

// Fires once per mount - a hook, not a rendered component, since its
// callers (StorySoFarTab/CarStorySoFarTab, TransferOwnershipSection/
// CarTransferOwnershipSection) each have several conditional JSX return
// branches, and this needs to fire regardless of which one renders. Only
// for the two steps with no natural request of their own to hook into -
// see /api/onboarding/complete's own comment for why the other four
// steps never use this.
export function useMarkOnboardingStepSeen(step: OnboardingStep) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    fetch('/api/onboarding/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step }),
    }).catch(() => {
      // Best-effort - a failed write here just means the checklist item
      // stays unticked until their next visit re-fires this effect.
    });
  }, [step]);
}
