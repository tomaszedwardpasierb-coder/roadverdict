// Place at: src/app/dashboard/TabSwitchContext.tsx
'use client';

import { createContext, useContext, type ReactNode } from 'react';

export type ReviewCategory = 'service' | 'fuel' | 'mods' | 'bills';

interface ContextValue {
  switchTo: (category: ReviewCategory) => void;
}

const TabSwitchContext = createContext<ContextValue | null>(null);

export function TabSwitchProvider({ children, onSwitchTab }: { children: ReactNode; onSwitchTab: (category: ReviewCategory) => void }) {
  return <TabSwitchContext.Provider value={{ switchTo: onSwitchTab }}>{children}</TabSwitchContext.Provider>;
}

export function useTabSwitch(): ContextValue {
  const ctx = useContext(TabSwitchContext);
  if (!ctx) return { switchTo: () => {} };
  return ctx;
}

const CATEGORY_LABELS: Record<ReviewCategory, string> = {
  service: 'Service',
  fuel: 'Fuel',
  mods: 'Parts & Accessories',
  bills: 'Tax & Insurance',
};

// Shared by all 4 history cards - after saving a record that needed
// review, checks whether anything else is still waiting elsewhere (any
// OTHER category, since something in the SAME category needs no prompt
// at all - the page refresh already surfaces it right there on the same
// tab) and offers to jump straight there. Uses the page-load snapshot of
// counts, not a live re-fetch - accurate enough for this decision, and
// avoids needing a server round-trip before deciding.
export function offerNextReview(
  pendingReviewCounts: Record<ReviewCategory, number>,
  myCategory: ReviewCategory,
  switchTo: (category: ReviewCategory) => void
) {
  const remainingHere = pendingReviewCounts[myCategory] - 1;
  if (remainingHere > 0) return;
  const otherCategory = (['service', 'fuel', 'mods', 'bills'] as ReviewCategory[]).find(
    (c) => c !== myCategory && pendingReviewCounts[c] > 0
  );
  if (otherCategory && confirm(`Saved. Open the next record waiting for review in ${CATEGORY_LABELS[otherCategory]}?`)) {
    switchTo(otherCategory);
  }
}
