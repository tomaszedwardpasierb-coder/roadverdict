// Place at: src/components/viewer/BuyingGuideFormsForViewer.tsx
'use client';

import { BuyingGuideForm } from '@/components/BuyingGuideForm';
import { CarBuyingGuideForm } from '@/components/CarBuyingGuideForm';
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

export function BuyingGuideFormForViewer() {
  const viewer = useViewer();
  return <BuyingGuideForm signedIn={viewer.signedIn} />;
}

export function CarBuyingGuideFormForViewer() {
  const viewer = useViewer();
  return <CarBuyingGuideForm signedIn={viewer.signedIn} />;
}
