// Place at: src/app/dashboard/ChartFilterContext.tsx
'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { RangeValue } from '@/lib/tracker/dateRange';

export type ViewBy = 'time' | 'mileage';

interface ChartFilterContextValue {
  range: RangeValue;
  setRange: (r: RangeValue) => void;
  viewBy: ViewBy;
  setViewBy: (v: ViewBy) => void;
}

const ChartFilterContext = createContext<ChartFilterContextValue | null>(null);

export function ChartFilterProvider({ children }: { children: ReactNode }) {
  const [range, setRange] = useState<RangeValue>('all');
  const [viewBy, setViewBy] = useState<ViewBy>('time');
  return (
    <ChartFilterContext.Provider value={{ range, setRange, viewBy, setViewBy }}>{children}</ChartFilterContext.Provider>
  );
}

// Falls back to "all"/"time" rather than throwing if a chart ever ends up
// rendered outside a provider - a missing shared filter should never be
// the reason a chart crashes the whole page.
export function useChartFilter(): ChartFilterContextValue {
  const ctx = useContext(ChartFilterContext);
  if (!ctx) return { range: 'all', setRange: () => {}, viewBy: 'time', setViewBy: () => {} };
  return ctx;
}
