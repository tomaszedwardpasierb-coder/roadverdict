// Place at: src/app/dashboard/ForecastToggle.tsx
'use client';

import { useChartFilter } from './ChartFilterContext';
import type { ForecastWindow } from '@/lib/tracker/costForecast';
import styles from './dashboard.module.css';

const WINDOW_OPTIONS: { value: ForecastWindow; label: string }[] = [
  { value: '3m', label: '3 months' },
  { value: '6m', label: '6 months' },
  { value: '1y', label: '1 year' },
];

// Deliberately its own control, separate from ChartFilterBar's range
// tabs - see the CSS comment on .forecastToggleGroup for why. Switching
// into Forecast has to be a genuine, deliberate act, and every chart
// this feeds (CategorySpendChart) renders a projection unmistakably
// differently from real data - dashed/lighter, with its own on-chart
// badge - so nobody can mistake a projection for their actual spend.
export function ForecastToggle() {
  const { forecastMode, setForecastMode, forecastWindow, setForecastWindow } = useChartFilter();

  return (
    <div className={styles.forecastToggleGroup}>
      <div className={styles.forecastToggleBtns} role="group" aria-label="Past or forecast">
        <button
          type="button"
          className={!forecastMode ? `${styles.forecastToggleBtn} ${styles.forecastToggleBtnActive}` : styles.forecastToggleBtn}
          onClick={() => setForecastMode(false)}
          aria-pressed={!forecastMode}
        >
          Past
        </button>
        <button
          type="button"
          className={forecastMode ? `${styles.forecastToggleBtn} ${styles.forecastToggleBtnActive}` : styles.forecastToggleBtn}
          onClick={() => setForecastMode(true)}
          aria-pressed={forecastMode}
        >
          Forecast
        </button>
      </div>
      {forecastMode && (
        <div className={styles.forecastWindowTabs} role="group" aria-label="Forecast window">
          {WINDOW_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className={forecastWindow === o.value ? `${styles.forecastWindowTab} ${styles.forecastWindowTabActive}` : styles.forecastWindowTab}
              onClick={() => setForecastWindow(o.value)}
              aria-pressed={forecastWindow === o.value}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
