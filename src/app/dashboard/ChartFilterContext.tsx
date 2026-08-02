// Place at: src/app/dashboard/ChartFilterContext.tsx
'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { RangeValue } from '@/lib/tracker/dateRange';

interface ChartFilterContextValue {
  range: RangeValue;
  setRange: (r: RangeValue) => void;
}

const ChartFilterContext = createContext<ChartFilterContextValue | null>(null);

export function ChartFilterProvider({ children }: { children: ReactNode }) {
  const [range, setRange] = useState<RangeValue>('all');
  return <ChartFilterContext.Provider value={{ range, setRange }}>{children}</ChartFilterContext.Provider>;
}

// Falls back to "all" rather than throwing if a chart ever ends up
// rendered outside a provider - a missing shared filter should never be
// the reason a chart crashes the whole page.
export function useChartFilter(): ChartFilterContextValue {
  const ctx = useContext(ChartFilterContext);
  if (!ctx) return { range: 'all', setRange: () => {} };
  return ctx;
}
