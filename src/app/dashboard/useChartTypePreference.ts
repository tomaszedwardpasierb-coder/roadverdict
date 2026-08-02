// Place at: src/app/dashboard/useChartTypePreference.ts
'use client';

import { useState } from 'react';

export type ChartKind = 'line' | 'bar' | 'pie';

// Optimistic: the chart switches instantly, the save happens in the
// background. If the save fails, the choice simply won't persist to next
// visit - not worth interrupting someone's chart-browsing over something
// this low-stakes.
export function useChartTypePreference(chartId: string, initial: ChartKind) {
  const [kind, setKind] = useState<ChartKind>(initial);

  async function changeKind(newKind: ChartKind) {
    setKind(newKind);
    try {
      await fetch('/api/tracker/bike', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartType: { chartId, kind: newKind } }),
      });
    } catch {
      // Preference just won't persist this time - see note above.
    }
  }

  return { kind, changeKind };
}
