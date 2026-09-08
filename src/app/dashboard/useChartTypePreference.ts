// Place at: src/app/dashboard/useChartTypePreference.ts
'use client';

import { useState } from 'react';

export type ChartKind = 'line' | 'bar' | 'pie';

// Optimistic: the chart switches instantly, the save happens in the
// background. If the save fails, the choice simply won't persist to next
// visit - not worth interrupting someone's chart-browsing over something
// this low-stakes.
//
// vehicleKind defaults to 'bike' so every existing call site keeps
// working unchanged - same minimal-generalization pattern BudgetWidget/
// UnitSettings already use. Was hardcoded to /api/tracker/bike
// unconditionally until a car-active session on a hybrid account (owns
// both a bike and a car) toggling a chart here silently overwrote the
// BIKE's own stored chart-type preference instead of the car's.
export function useChartTypePreference(chartId: string, initial: ChartKind, vehicleKind: 'bike' | 'car' = 'bike') {
  const [kind, setKind] = useState<ChartKind>(initial);

  async function changeKind(newKind: ChartKind) {
    setKind(newKind);
    try {
      await fetch(vehicleKind === 'car' ? '/api/cars/car' : '/api/tracker/bike', {
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
