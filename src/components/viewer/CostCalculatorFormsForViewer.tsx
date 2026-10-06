// Place at: src/components/viewer/CostCalculatorFormsForViewer.tsx
'use client';

import { CostCalculatorForm } from '@/components/CostCalculatorForm';
import { CarCostCalculatorForm } from '@/components/CarCostCalculatorForm';
import { useViewer } from './useViewer';

// The public tool pages are static, so a signed-in visitor's "you're
// signed in" state and their own bike/car prefill can only arrive after
// the page loads. Each form seeds its selections from its initial* props
// once, in useState - so when the real viewer arrives, the form is
// remounted (via key) rather than passed changed props it would ignore.
// Only signed-in visitors ever remount; an anonymous visitor's form is
// never touched.
//
// Each tool's pair of wrappers lives in its own file, so a page loads only
// its own form: when all six shared one file, every tool page also
// downloaded the Buying Guide's chart library (~48 KB) it never used.

export function CostCalculatorFormForViewer() {
  const viewer = useViewer();
  return (
    <CostCalculatorForm
      key={viewer.signedIn ? 'signed-in' : 'anon'}
      signedIn={viewer.signedIn}
      initialBrand={viewer.bike?.brand}
      initialModel={viewer.bike?.model}
      initialBikeClass={viewer.bike?.bikeClass}
    />
  );
}

export function CarCostCalculatorFormForViewer() {
  const viewer = useViewer();
  return (
    <CarCostCalculatorForm
      key={viewer.signedIn ? 'signed-in' : 'anon'}
      signedIn={viewer.signedIn}
      initialBrand={viewer.car?.brand}
      initialCarClass={viewer.car?.carClass}
    />
  );
}
