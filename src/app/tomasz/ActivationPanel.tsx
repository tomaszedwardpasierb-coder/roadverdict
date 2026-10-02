// Place at: src/app/tomasz/ActivationPanel.tsx
//
// Who keeps using RoadVerdict after signing up (lib/analytics/activation.ts):
// the weekly "added something real" number, and how each week's new
// accounts got on. Worked out from the records themselves, so it covers
// every account, not only those since a counter was added.
import { getActivationStats, type AccountRow, type ActivationStats } from '@/lib/analytics/activation';
import styles from './adminShell.module.css';

function fmtWeek(weekStart: string): string {
  return new Date(`${weekStart}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function share(part: number, whole: number): string {
  return whole > 0 ? `${part} (${Math.round((part / whole) * 100)}%)` : '-';
}

export async function ActivationPanel({ accounts }: { accounts: AccountRow[] }) {
  let stats: ActivationStats;
  try {
    stats = await getActivationStats(accounts);
  } catch {
    return <p className={styles.warnNote}>Activation couldn&apos;t be loaded.</p>;
  }
  const [thisWeek, lastWeek] = stats.weeks;

  return (
    <>
      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Added something real this week</div>
          <p className={styles.metricValue}>{thisWeek.people}</p>
          <p className={styles.note}>
            Last week: {lastWeek.people}. People who logged a service, fill-up, bill, part, labour, fine or toll - the
            number the growth plan watches most.
          </p>
        </div>
      </div>
      <p className={styles.warnNote} style={{ margin: '0.6rem 0' }}>
        Read from the records themselves (UK weeks, Monday to Sunday). Imported MOT tests, automatic instalments and
        the demo account don&apos;t count; your own account does.
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Week starting</th>
            <th>Added something real</th>
          </tr>
        </thead>
        <tbody>
          {stats.weeks.map((w) => (
            <tr key={w.weekStart}>
              <td>{fmtWeek(w.weekStart)}</td>
              <td>{w.people}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className={styles.table} style={{ marginTop: '1rem' }}>
        <thead>
          <tr>
            <th>New accounts, week starting</th>
            <th>Accounts</th>
            <th>Added a vehicle</th>
            <th>Added a real record</th>
            <th>Added something in week 2</th>
          </tr>
        </thead>
        <tbody>
          {stats.cohorts.map((c) => (
            <tr key={c.weekStart}>
              <td>{fmtWeek(c.weekStart)}</td>
              <td>{c.accounts}</td>
              <td>{share(c.addedVehicle, c.accounts)}</td>
              <td>{share(c.addedRecord, c.accounts)}</td>
              <td>{c.week2Eligible > 0 ? share(c.week2, c.week2Eligible) : 'Too soon'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
