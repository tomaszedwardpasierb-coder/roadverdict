// Place at: src/app/demo/DemoCharts.tsx
//
// The sample bike's three charts: spend by month, where the money goes, and
// fuel economy. Plain SVG and CSS, no chart library, drawn from the figures
// in lib/demo/sampleBike.ts. Each has a text description for screen
// readers, since the picture alone carries the numbers.
import styles from './demo.module.css';

function pounds(n: number): string {
  return `£${Math.round(n).toLocaleString('en-GB')}`;
}

export function SpendByMonth({ data, highlight }: { data: { month: string; label: string; total: number }[]; highlight: string | null }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const W = 600;
  const H = 190;
  const base = 160;
  const slot = W / data.length;
  const total = data.reduce((s, d) => s + d.total, 0);
  return (
    <figure className={styles.chart}>
      <figcaption className={styles.chartTitle}>Spend by month</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Monthly spending over 12 months, ${pounds(total)} in total`} className={styles.svg}>
        <line x1="0" y1={base} x2={W} y2={base} stroke="var(--border)" />
        {data.map((d, i) => {
          const h = (d.total / max) * 130;
          const x = i * slot + slot * 0.18;
          const hot = d.month === highlight;
          return (
            <g key={d.month}>
              <rect x={x} y={base - h} width={slot * 0.64} height={Math.max(h, d.total > 0 ? 2 : 0)} rx="3" fill={hot ? 'var(--green)' : 'var(--amber)'} />
              {d.total > 0 && (hot || d.total === max) ? (
                <text x={x + slot * 0.32} y={base - h - 6} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--ink)">
                  {pounds(d.total)}
                </text>
              ) : null}
              <text x={x + slot * 0.32} y={base + 20} textAnchor="middle" fontSize="13" fill="var(--ink-soft)">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export function SpendByCategory({ data }: { data: { category: string; label: string; total: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <figure className={styles.chart}>
      <figcaption className={styles.chartTitle}>Where it goes</figcaption>
      <ul className={styles.bars} aria-label="Spending by category">
        {data.map((d) => (
          <li key={d.category} className={styles.barRow}>
            <span className={styles.barLabel}>{d.label}</span>
            <span className={styles.barTrack}>
              <span className={styles.barFill} style={{ width: `${Math.max(3, (d.total / max) * 100)}%` }} />
            </span>
            <span className={styles.barValue}>{pounds(d.total)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function FuelEconomyLine({ data }: { data: { date: string; mpg: number }[] }) {
  if (data.length < 2) return null;
  const W = 600;
  const H = 170;
  const values = data.map((d) => d.mpg);
  const lo = Math.floor(Math.min(...values) - 2);
  const hi = Math.ceil(Math.max(...values) + 2);
  const x = (i: number) => 20 + (i * (W - 40)) / (data.length - 1);
  const y = (v: number) => 20 + (1 - (v - lo) / (hi - lo)) * 110;
  const points = data.map((d, i) => `${x(i)},${y(d.mpg)}`).join(' ');
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  return (
    <figure className={styles.chart}>
      <figcaption className={styles.chartTitle}>Fuel economy (mpg)</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Fuel economy between fill-ups, averaging ${avg.toFixed(0)} miles per gallon`} className={styles.svg}>
        <line x1="20" y1={y(avg)} x2={W - 20} y2={y(avg)} stroke="var(--border)" strokeDasharray="4 4" />
        <polyline points={points} fill="none" stroke="var(--blue)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <circle key={d.date} cx={x(i)} cy={y(d.mpg)} r="4.5" fill="var(--blue)" />
        ))}
        <text x="20" y="160" fontSize="13" fill="var(--ink-soft)">
          {new Date(`${data[0].date}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })}
        </text>
        <text x={W - 20} y="160" textAnchor="end" fontSize="13" fill="var(--ink-soft)">
          {new Date(`${data[data.length - 1].date}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })}
        </text>
        <text x={W - 20} y={y(avg) - 6} textAnchor="end" fontSize="13" fontWeight="700" fill="var(--ink)">
          average {avg.toFixed(0)} mpg
        </text>
      </svg>
    </figure>
  );
}
