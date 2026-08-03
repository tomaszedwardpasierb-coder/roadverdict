// Place at: src/app/dashboard/ReminderItem.tsx
'use client';

import { useState } from 'react';
import type { ReminderDoc } from '@/lib/tracker/reminder';
import { reminderDetailLabel } from '@/lib/tracker/reminderStatus';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import styles from './dashboard.module.css';

export function ReminderItem({ reminder, status }: { reminder: ReminderDoc; status: 'ok' | 'due-soon' | 'overdue' }) {
  const { submit, submitting } = useTrackerFormSubmit(`/api/tracker/reminders/${encodeURIComponent(reminder.id)}`);
  const [hidden, setHidden] = useState(false);

  const statusLabel = status === 'ok' ? 'OK' : status === 'due-soon' ? 'Due soon' : 'Overdue';
  const statusClass =
    status === 'ok' ? styles.reminderStatusOk : status === 'due-soon' ? styles.reminderStatusDueSoon : styles.reminderStatusOverdue;

  async function handleDone() {
    if (reminder.intervalType === 'date') {
      // one-off - nothing to roll forward to, so "done" just clears it
      if (!confirm("Delete this reminder? Exact-date reminders don't repeat.")) return;
      await submit(undefined, 'DELETE');
      setHidden(true);
      return;
    }
    await submit(undefined, 'PATCH');
  }

  async function handleDelete() {
    if (!confirm("Delete this reminder? This can't be undone.")) return;
    await submit(undefined, 'DELETE');
    setHidden(true);
  }

  if (hidden) return null;

  return (
    <div className={styles.reminderItem}>
      <div>
        <div className={styles.reminderItemName}>{reminder.name}</div>
        <div className={styles.reminderItemDetail}>{reminderDetailLabel(reminder)}</div>
      </div>
      <div className={styles.reminderItemActions}>
        <span className={`${styles.reminderStatus} ${statusClass}`}>{statusLabel}</span>
        <button type="button" className={styles.iconBtn} onClick={handleDone} disabled={submitting}>✓ Done</button>
        <button type="button" className={styles.iconBtn} onClick={handleDelete} disabled={submitting}>✕</button>
      </div>
    </div>
  );
}
