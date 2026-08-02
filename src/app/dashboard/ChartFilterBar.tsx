// Place at: src/app/dashboard/ChartFilterBar.tsx
'use client';

import { RANGE_OPTIONS } from '@/lib/tracker/dateRange';
import { useChartFilter } from './ChartFilterContext';
import styles from './dashboard.module.css';

export function ChartFilterBar() {
  const { range, setRange } = useChartFilter();
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
    </div>
  );
}
