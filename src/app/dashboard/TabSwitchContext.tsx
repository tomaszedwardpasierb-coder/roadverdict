// Place at: src/app/dashboard/TabSwitchContext.tsx
'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

export type ReviewCategory = 'service' | 'fuel' | 'mods' | 'bills';

interface ContextValue {
  switchTo: (category: ReviewCategory) => void;
  // The single record a card should automatically open into edit mode
  // the moment it sees itself named here - lives above the point where
  // individual tab content mounts/unmounts (same reason the queue-based
  // scanner state used to live here), so it survives a tab switch
  // between "save this one" and "the next one showing up".
  focusId: string | null;
  setFocusId: (id: string | null) => void;
}

const TabSwitchContext = createContext<ContextValue | null>(null);

export function TabSwitchProvider({ children, onSwitchTab }: { children: ReactNode; onSwitchTab: (category: ReviewCategory) => void }) {
  const [focusId, setFocusId] = useState<string | null>(null);
  return (
    <TabSwitchContext.Provider value={{ switchTo: onSwitchTab, focusId, setFocusId }}>
      {children}
    </TabSwitchContext.Provider>
  );
}

export function useTabSwitch(): ContextValue {
  const ctx = useContext(TabSwitchContext);
  if (!ctx) return { switchTo: () => {}, focusId: null, setFocusId: () => {} };
  return ctx;
}

const CATEGORY_ORDER: ReviewCategory[] = ['service', 'fuel', 'mods', 'bills'];

// Shared by all 4 history cards - after saving a record that needed
// review, moves straight to whatever's next with zero confirmation:
// something else in the SAME category first (stays on this tab, just
// tells that next card to open its own edit mode), otherwise the first
// pending item in another category (switches tabs, then does the same).
// Uses the page-load snapshot of ids, not a live re-fetch - myId is
// explicitly excluded since the snapshot still includes the record that
// was just saved.
export function goToNextReview(
  pendingReviewIds: Record<ReviewCategory, string[]>,
  myCategory: ReviewCategory,
  myId: string,
  switchTo: (category: ReviewCategory) => void,
  setFocusId: (id: string | null) => void
) {
  const remainingHere = pendingReviewIds[myCategory].filter((id) => id !== myId);
  if (remainingHere.length > 0) {
    setFocusId(remainingHere[0]);
    return;
  }
  for (const category of CATEGORY_ORDER) {
    if (category === myCategory) continue;
    const ids = pendingReviewIds[category];
    if (ids.length > 0) {
      switchTo(category);
      setFocusId(ids[0]);
      return;
    }
  }
  setFocusId(null);
}
