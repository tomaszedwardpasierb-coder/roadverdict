// Place at: src/app/dashboard/ChartTypeToggle.tsx
'use client';

import type { ChartKind } from './useChartTypePreference';
import styles from './dashboard.module.css';

const LABELS: Record<ChartKind, string> = {
  line: 'Line',
  bar: 'Bar',
  pie: 'Pie',
};

interface Props {
  value: ChartKind;
  onChange: (kind: ChartKind) => void;
  options: ChartKind[];
}

// Text labels rather than icons, deliberately - clearer at a glance, and
// consistent with how every other in-chart control in this app (the date
// range tabs) already uses plain text buttons, not icon-only ones.
export function ChartTypeToggle({ value, onChange, options }: Props) {
  if (options.length <= 1) return null;
  return (
    <div className={styles.chartTypeToggle}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={`${styles.chartTypeToggleBtn} ${value === opt ? styles.chartTypeToggleBtnActive : ''}`}
          onClick={() => onChange(opt)}
        >
          {LABELS[opt]}
        </button>
      ))}
    </div>
  );
}
