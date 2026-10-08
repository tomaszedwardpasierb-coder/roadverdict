// Place at: src/app/tomasz/TesterGridPanel.tsx
//
// The tester grid for /tomasz: one row per tester, one square per day for the
// last 14, green when they used RoadVerdict that day, with totals underneath
// that answer Google's production-access questions (how many testers signed in,
// how much they logged, how many receipts they scanned). See
// admin/testerReport.ts for how each number is worked out.
import { formatAgo, type TesterGrid } from '@/lib/admin/testerReport';
import styles from './adminShell.module.css';

const GREEN = '#21815A';

function parts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return {
    short: String(d),
    long: date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }),
    weekday: date.toLocaleDateString('en-GB', { weekday: 'narrow', timeZone: 'UTC' }),
  };
}

function Square({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      role="img"
      aria-label={`${on ? 'Used it' : 'Did not use it'} on ${label}`}
      title={`${on ? 'Used it' : 'Not used'} - ${label}`}
      style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: on ? GREEN : 'var(--admin-border)' }}
    />
  );
}

export function TesterGridPanel({
  grid,
  scansFrom,
  scansUnavailable,
  now,
}: {
  grid: TesterGrid;
  // The earliest receipt scan on record, so the page can say what it counts from.
  scansFrom: string | null;
  scansUnavailable: boolean;
  now: Date;
}) {
  const { totals, rows, days } = grid;

  if (rows.length === 0) {
    return (
      <p className={styles.note}>
        No account is tagged <strong>tester</strong> yet. Tag them in Accounts &amp; sessions (tick the rows, then use the tag buttons) and they will appear here.
      </p>
    );
  }

  const scanNote = scansUnavailable
    ? 'receipt scans could not be loaded just now'
    : scansFrom
      ? `receipt scans counted from ${new Date(scansFrom).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, when they started being recorded`
      : 'no receipt scans recorded yet (they are only counted from when this tracking began)';

  const metrics: { label: string; value: number }[] = [
    { label: 'Testers', value: totals.testers },
    { label: 'Signed in to the app', value: totals.signedInToApp },
    { label: 'Used it in the last 14 days', value: totals.active },
    { label: 'Entries logged', value: totals.entries },
    { label: 'Receipts scanned', value: totals.receiptScans },
  ];

  return (
    <>
      <div className={styles.grid} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {metrics.map((m) => (
          <div key={m.label} className={styles.card}>
            <div className={styles.cardTitle}>{m.label}</div>
            <div className={styles.metricValue}>{m.value}</div>
          </div>
        ))}
      </div>

      <p style={{ margin: '0.9rem 0 0.4rem', fontSize: '0.83rem' }}>
        <strong>For Google&apos;s form:</strong> In the last 14 days, {totals.active} of our {totals.testers} testers used RoadVerdict on at least one day.{' '}
        {totals.signedInToApp} signed in to the app, and between them they logged {totals.entries} entries and scanned {totals.receiptScans} receipts.
      </p>
      <p className={styles.note} style={{ marginBottom: '0.9rem' }}>
        Entries are everything the testers logged since they joined; {scanNote}.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Tester</th>
              {days.map((day, i) => {
                const p = parts(day);
                return (
                  <th key={day} title={p.long} style={{ textAlign: 'center', padding: '0.5rem 0.15rem', fontWeight: i === days.length - 1 ? 700 : 600 }}>
                    <div style={{ fontSize: '0.65rem', opacity: 0.7 }}>{p.weekday}</div>
                    <div>{p.short}</div>
                  </th>
                );
              })}
              <th>Days</th>
              <th>Entries</th>
              <th>Scans</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.email}>
                <td className={styles.mono} style={{ whiteSpace: 'nowrap' }}>
                  {row.email}
                  {row.usesApp ? ' (app)' : ''}
                </td>
                {row.cells.map((on, i) => (
                  <td key={days[i]} style={{ textAlign: 'center', padding: '0.4rem 0.15rem' }}>
                    <Square on={on} label={parts(days[i]).long} />
                  </td>
                ))}
                <td>{row.activeDays}</td>
                <td>{row.entries}</td>
                <td>{row.receiptScans}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{row.lastSeenAt ? formatAgo(row.lastSeenAt, now) : 'never'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
