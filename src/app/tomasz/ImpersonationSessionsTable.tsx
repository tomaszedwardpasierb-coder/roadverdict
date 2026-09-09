// Place at: src/app/tomasz/ImpersonationSessionsTable.tsx
//
// Read-only - unlike AssistantQuestionsTable, there's no admin action to
// take on a past impersonation session (nothing to delete; the record
// is the point). Sessions is already sorted newest-first by
// getAllImpersonationSessions itself.
import type { ImpersonationSession } from '@/lib/admin/impersonation';
import styles from './adminShell.module.css';

function fmtDate(d: string): string {
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDuration(minutes: number | null): string {
  if (minutes === null) return 'Still active / never exited';
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

interface Row extends ImpersonationSession {
  changesCount: number;
}

export function ImpersonationSessionsTable({ sessions }: { sessions: Row[] }) {
  if (sessions.length === 0) {
    return <p className={styles.warnNote}>No impersonation sessions logged yet.</p>;
  }

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Target account</th>
          <th>Reason</th>
          <th>Started</th>
          <th>Duration</th>
          <th>Changes made</th>
        </tr>
      </thead>
      <tbody>
        {sessions.map((s) => (
          <tr key={s.sessionId}>
            <td className={styles.mono}>{s.targetEmail}</td>
            <td>{s.reason ?? <span className={styles.note}>Not given</span>}</td>
            <td>{fmtDate(s.startedAt)}</td>
            <td>{fmtDuration(s.durationMinutes)}</td>
            <td>{s.changesCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
