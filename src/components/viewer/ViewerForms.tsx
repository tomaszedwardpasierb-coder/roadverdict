// Place at: src/components/viewer/ViewerForms.tsx
'use client';

import { QuoteForm } from '@/components/QuoteForm';
import { CarQuoteForm } from '@/components/CarQuoteForm';
import { CostCalculatorForm } from '@/components/CostCalculatorForm';
import { CarCostCalculatorForm } from '@/components/CarCostCalculatorForm';
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

export function QuoteFormForViewer() {
  const viewer = useViewer();
  return (
    <QuoteForm
      key={viewer.signedIn ? 'signed-in' : 'anon'}
      signedIn={viewer.signedIn}
      initialBrand={viewer.bike?.brand}
      initialBikeClass={viewer.bike?.bikeClass}
    />
  );
}

export function CarQuoteFormForViewer() {
  const viewer = useViewer();
  return (
    <CarQuoteForm
      key={viewer.signedIn ? 'signed-in' : 'anon'}
      signedIn={viewer.signedIn}
      initialBrand={viewer.car?.brand}
      initialCarClass={viewer.car?.carClass}
    />
  );
}

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

export function BuyingGuideFormForViewer() {
  const viewer = useViewer();
  return <BuyingGuideForm signedIn={viewer.signedIn} />;
}

export function CarBuyingGuideFormForViewer() {
  const viewer = useViewer();
  return <CarBuyingGuideForm signedIn={viewer.signedIn} />;
}
