// Place at: src/app/dashboard/CarReminderItem.tsx
'use client';

import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { carReminderDetailLabel } from '@/lib/tracker/carReminderStatus';
import type { CarReminderDoc } from '@/lib/tracker/carReminder';
import styles from './dashboard.module.css';

interface Props {
  reminder: CarReminderDoc;
  status: 'ok' | 'due-soon' | 'overdue';
  isPro?: boolean;
}

const STATUS_LABEL: Record<Props['status'], string> = {
  ok: 'On track',
  'due-soon': 'Due soon',
  overdue: 'Overdue',
};

export function CarReminderItem({ reminder, status, isPro = false }: Props) {
  const { submit, submitting } = useTrackerFormSubmit(`/api/cars/car-reminders/${reminder.id}`);

  async function handleDone() {
    // A pure date-type reminder has no interval to roll forward - "mark
    // done" resetting baseMileage/date wouldn't move its exactDate at
    // all, so it would still show overdue immediately after. Deleting
    // it is the only action that actually means "done" for this type.
    if (reminder.intervalType === 'date' && !reminder.additionalTriggers?.length) {
      await submit(undefined, 'DELETE');
    } else {
      await submit(undefined, 'PATCH');
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this reminder?')) return;
    await submit(undefined, 'DELETE');
  }

  return (
    <div className={styles.card} style={{ marginTop: '0.6rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
        <strong>{reminder.name}</strong>
        <span style={{ fontWeight: 600, color: status === 'overdue' ? 'var(--verdict-red)' : status === 'due-soon' ? 'var(--amber-ink)' : 'var(--ink-soft)' }}>
          {STATUS_LABEL[status]}
        </span>
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginTop: '0.2rem' }}>
        {isPro ? carReminderDetailLabel(reminder) : '🔒 Upgrade to Pro to see the exact due date/mileage'}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
        <button type="button" className="btn-primary" onClick={handleDone} disabled={submitting}>Mark done</button>
        <button type="button" className={styles.iconBtn} onClick={handleDelete} disabled={submitting}>Delete</button>
      </div>
    </div>
  );
}
