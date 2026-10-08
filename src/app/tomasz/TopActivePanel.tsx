// Place at: src/app/tomasz/TopActivePanel.tsx
//
// The ten accounts that used RoadVerdict on the most days in the last 14, for
// /tomasz (most days, then most entries; see admin/testerReport.ts). Tags are
// shown so a tester, friend or press account isn't mistaken for a customer.
import { formatAgo, type TopActiveRow } from '@/lib/admin/testerReport';
import styles from './adminShell.module.css';

const TAG_COLOUR: Record<string, string> = { tester: '#6B4FBB', friend: '#2F7D8C', press: '#8A6100' };

export function TopActivePanel({ rows, now }: { rows: TopActiveRow[]; now: Date }) {
  if (rows.length === 0) {
    return <p className={styles.note}>No account has used RoadVerdict in the last 14 days yet.</p>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>#</th>
            <th>Account</th>
            <th>Days used (of 14)</th>
            <th>Entries</th>
            <th>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.email}>
              <td>{i + 1}</td>
              <td>
                <span className={styles.mono}>{r.email}</span>
                {r.usesApp ? ' (app)' : ''}{' '}
                {r.tags.map((tag) => (
                  <span key={tag} className={styles.badge} style={{ background: TAG_COLOUR[tag] ?? '#777', color: '#fff', marginLeft: 4 }}>
                    {tag}
                  </span>
                ))}
              </td>
              <td>{r.activeDays}</td>
              <td>{r.entries}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{r.lastSeenAt ? formatAgo(r.lastSeenAt, now) : 'never'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
