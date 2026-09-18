// Place at: src/app/dashboard/ChartFilterBar.tsx
'use client';

import { RANGE_OPTIONS } from '@/lib/tracker/dateRange';
import { FORECAST_WINDOW_OPTIONS } from '@/lib/tracker/costForecast';
import { useChartFilter, type ViewBy } from './ChartFilterContext';
import { ForecastToggle } from './ForecastToggle';
import styles from './dashboard.module.css';

const VIEW_BY_OPTIONS: { value: ViewBy; label: string }[] = [
  { value: 'time', label: 'Time' },
  { value: 'mileage', label: 'Mileage' },
];

export function ChartFilterBar() {
  const { range, setRange, viewBy, setViewBy, forecastMode, forecastWindow, setForecastWindow } = useChartFilter();
  return (
    <>
      <ForecastToggle />
      <div className={styles.globalFilterBar}>
        {forecastMode ? (
          // Same range-bar pill pattern as "Range" below, deliberately
          // reused rather than a bespoke widget - the only things that
          // change are the label and the option set (forward-looking
          // windows, no "All"/"YTD" - there's no such thing as
          // forecasting forever). The active pill still gets the
          // Forecast-blue treatment (forecastWindowTabActive), not the
          // real-data asphalt one, so it stays visually tied to Forecast
          // mode rather than reading as just another range filter.
          <>
            <span className={styles.globalFilterLabel}>Forecast window</span>
            <div className={styles.rangeTabs} style={{ marginBottom: 0 }}>
              {FORECAST_WINDOW_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`${styles.rangeTab} ${forecastWindow === o.value ? styles.forecastWindowTabActive : ''}`}
                  onClick={() => setForecastWindow(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <span className={styles.globalFilterLabel}>Range</span>
            <div className={styles.rangeTabs} style={{ marginBottom: 0 }}>
              {RANGE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`${styles.rangeTab} ${range === o.value ? styles.rangeTabActive : ''}`}
                  onClick={() => setRange(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <span className={styles.globalFilterLabel} style={{ marginLeft: '0.5rem' }}>View by</span>
            <div className={styles.rangeTabs} style={{ marginBottom: 0 }}>
              {VIEW_BY_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`${styles.rangeTab} ${viewBy === o.value ? styles.rangeTabActive : ''}`}
                  onClick={() => setViewBy(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
