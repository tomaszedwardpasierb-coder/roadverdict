// Place at: src/app/dashboard/ForecastToggle.tsx
'use client';

import { useChartFilter } from './ChartFilterContext';
import styles from './ForecastToggle.module.css';

// Deliberately its own control, separate from the range/window tabs -
// see .forecastToggleGroup's own CSS comment for why. Switching into
// Forecast has to be a genuinely deliberate act - every chart this feeds
// (CategorySpendChart, MileageChart) renders a projection unmistakably
// differently from real data - dashed/lighter, with its own on-chart
// badge - so nobody can mistake a projection for their actual spend.
// The window itself (Next week/month/6 months/year) is chosen right
// below this, via the same range-bar pattern real data's Range tabs
// use - see ChartFilterBar.tsx.
export function ForecastToggle() {
  const { forecastMode, setForecastMode } = useChartFilter();

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
    </div>
  );
}
