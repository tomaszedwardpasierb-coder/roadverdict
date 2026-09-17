// Place at: src/app/dashboard/ChartFilterContext.tsx
'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { RangeValue } from '@/lib/tracker/dateRange';
import type { ForecastWindow } from '@/lib/tracker/costForecast';

export type ViewBy = 'time' | 'mileage';

interface ChartFilterContextValue {
  range: RangeValue;
  setRange: (r: RangeValue) => void;
  viewBy: ViewBy;
  setViewBy: (v: ViewBy) => void;
  // Forecast is deliberately its own on/off flag, not a value alongside
  // range - it changes what a chart IS (projected vs real), not just
  // which slice of real data it shows, and it always starts false: never
  // persisted, never remembered between visits, so nobody can load the
  // dashboard days later and mistake a stale forecast view for their
  // actual recorded spend. See ForecastToggle.tsx.
  forecastMode: boolean;
  setForecastMode: (v: boolean) => void;
  forecastWindow: ForecastWindow;
  setForecastWindow: (w: ForecastWindow) => void;
}

const ChartFilterContext = createContext<ChartFilterContextValue | null>(null);

export function ChartFilterProvider({ children }: { children: ReactNode }) {
  const [range, setRange] = useState<RangeValue>('all');
  const [viewBy, setViewBy] = useState<ViewBy>('time');
  const [forecastMode, setForecastMode] = useState(false);
  const [forecastWindow, setForecastWindow] = useState<ForecastWindow>('6m');
  return (
    <ChartFilterContext.Provider value={{ range, setRange, viewBy, setViewBy, forecastMode, setForecastMode, forecastWindow, setForecastWindow }}>
      {children}
    </ChartFilterContext.Provider>
  );
}

// Falls back to "all"/"time"/forecast-off rather than throwing if a
// chart ever ends up rendered outside a provider - a missing shared
// filter should never be the reason a chart crashes the whole page.
export function useChartFilter(): ChartFilterContextValue {
  const ctx = useContext(ChartFilterContext);
  if (!ctx) {
    return {
      range: 'all', setRange: () => {}, viewBy: 'time', setViewBy: () => {},
      forecastMode: false, setForecastMode: () => {}, forecastWindow: '6m', setForecastWindow: () => {},
    };
  }
  return ctx;
}
