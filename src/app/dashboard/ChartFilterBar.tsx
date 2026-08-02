// Place at: src/app/dashboard/ChartFilterBar.tsx
'use client';

import { RANGE_OPTIONS } from '@/lib/tracker/dateRange';
import { useChartFilter, type ViewBy } from './ChartFilterContext';
import styles from './dashboard.module.css';

const VIEW_BY_OPTIONS: { value: ViewBy; label: string }[] = [
  { value: 'time', label: 'Time' },
  { value: 'mileage', label: 'Mileage' },
];

export function ChartFilterBar() {
  const { range, setRange, viewBy, setViewBy } = useChartFilter();
  return (
    <div className={styles.globalFilterBar}>
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
    </div>
  );
}
