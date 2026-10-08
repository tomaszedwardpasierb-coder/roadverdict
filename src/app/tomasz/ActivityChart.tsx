// Place at: src/app/tomasz/ActivityChart.tsx
//
// A 30-day daily-active-users chart for /tomasz: one stacked bar per UK day,
// split into the Android app, the website, and "unknown" for days recorded
// before the app/web split existed. Drawn as plain SVG, so it adds nothing to
// the page's weight. Testers get their own chart (see admin/testerReport.ts).
import type { DauSeries } from '@/lib/admin/testerReport';
import styles from './adminShell.module.css';

const COLOURS = { app: '#EE9A2E', web: '#3E4C6B', unknown: '#C9C6BD' } as const;
const W = 600;
const H = 130;
const LEFT = 26;
const TOP = 8;
const BOTTOM = 20;

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function ActivityChart({ title, series }: { title: string; series: DauSeries }) {
  const { days, peak, today } = series;
  const max = Math.max(peak, 3);
  const plotH = H - TOP - BOTTOM;
  const slot = (W - LEFT) / days.length;
  const barW = Math.max(4, slot - 3);
  const y = (n: number) => TOP + plotH - (n / max) * plotH;
  const summary = `${title}: today ${today}, busiest day ${peak}, over the last ${days.length} days.`;

  return (
    <div className={styles.card} style={{ marginBottom: '0.8rem' }}>
      <div className={styles.cardTitle}>
        {title} <span className={styles.note}>today {today} - busiest day {peak}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <line x1={LEFT} x2={W} y1={y(0)} y2={y(0)} stroke="var(--admin-border-strong)" />
        <text x={LEFT - 4} y={y(max) + 3} textAnchor="end" fontSize="9" fill="var(--admin-text-secondary)">
          {max}
        </text>
        <text x={LEFT - 4} y={y(0) + 3} textAnchor="end" fontSize="9" fill="var(--admin-text-secondary)">
          0
        </text>
        {days.map((d, i) => {
          const x = LEFT + i * slot + (slot - barW) / 2;
          let top = y(0);
          const segment = (n: number, colour: string, key: string) => {
            if (n <= 0) return null;
            const h = (n / max) * plotH;
            top -= h;
            return <rect key={key} x={x} y={top} width={barW} height={h} fill={colour} />;
          };
          return (
            <g key={d.day} data-day={d.day}>
              <title>{`${dayLabel(d.day)}: ${d.total} active (${d.app} app, ${d.web} website${d.unknown ? `, ${d.unknown} not split` : ''})`}</title>
              {/* a faint full-height hit area so the tooltip works on empty days too */}
              <rect x={x} y={TOP} width={barW} height={plotH} fill="transparent" />
              {segment(d.app, COLOURS.app, 'app')}
              {segment(d.web, COLOURS.web, 'web')}
              {segment(d.unknown, COLOURS.unknown, 'unknown')}
            </g>
          );
        })}
        <text x={LEFT} y={H - 5} fontSize="9" fill="var(--admin-text-secondary)">
          {dayLabel(days[0].day)}
        </text>
        <text x={W} y={H - 5} textAnchor="end" fontSize="9" fill="var(--admin-text-secondary)">
          {dayLabel(days[days.length - 1].day)}
        </text>
      </svg>
      <div className={styles.note} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
        {(['app', 'web', 'unknown'] as const).map((k) => (
          <span key={k}>
            <span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: COLOURS[k], marginRight: 4 }} />
            {k === 'app' ? 'Android app' : k === 'web' ? 'Website' : 'Not split (recorded before this view)'}
          </span>
        ))}
      </div>
    </div>
  );
}
