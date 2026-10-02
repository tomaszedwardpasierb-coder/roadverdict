// Place at: src/app/dashboard/ReminderEditForm.tsx
//
// Edits a reminder's name and main schedule in place - shared by the bike
// and car reminder cards (see lib/tracker/reminderEdit.ts for the rules).
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Schedule = 'mileage' | 'months' | 'date';

export interface EditableReminder {
  id: string;
  name: string;
  intervalType: string;
  intervalValue?: number;
  exactDate?: string;
}

export function ReminderEditForm({
  reminder,
  endpoint,
  distanceLabel = 'miles',
  onClose,
}: {
  reminder: EditableReminder;
  // e.g. /api/tracker/reminders/<id>
  endpoint: string;
  distanceLabel?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const startType: Schedule = reminder.intervalType === 'date' || reminder.intervalType === 'months' ? reminder.intervalType : 'mileage';
  const [name, setName] = useState(reminder.name);
  const [type, setType] = useState<Schedule>(startType);
  const [value, setValue] = useState(reminder.intervalValue != null ? String(reminder.intervalValue) : '');
  const [date, setDate] = useState(reminder.exactDate?.slice(0, 10) ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          type === 'date'
            ? { name, intervalType: 'date', exactDate: date }
            : { name, intervalType: type, intervalValue: Number(value.replace(/,/g, '')) }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Could not save the reminder. Try again.');
        setSaving(false);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError('Couldn’t reach the server. Check your connection and try again.');
      setSaving(false);
    }
  }

  const id = `edit-${reminder.id.slice(-8)}`;
  return (
    <form onSubmit={save} style={{ width: '100%', marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px solid var(--line)' }}>
      <div className="field" style={{ marginTop: 0 }}>
        <label htmlFor={`${id}-name`}>What for</label>
        <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: 1, minWidth: '9rem' }}>
          <label htmlFor={`${id}-type`}>Remind me</label>
          <select
            id={`${id}-type`}
            value={type}
            onChange={(e) => {
              const next = e.target.value as Schedule;
              setType(next);
              // A number of miles means nothing as months - start empty,
              // unless it's the reminder's own original schedule again.
              setValue(next === startType && reminder.intervalValue != null ? String(reminder.intervalValue) : '');
            }}
          >
            <option value="mileage">Every … {distanceLabel}</option>
            <option value="months">Every … months</option>
            <option value="date">On a date</option>
          </select>
        </div>
        {type === 'date' ? (
          <div className="field" style={{ flex: 1, minWidth: '9rem' }}>
            <label htmlFor={`${id}-date`}>Date</label>
            <input id={`${id}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
        ) : (
          <div className="field" style={{ flex: 1, minWidth: '9rem' }}>
            <label htmlFor={`${id}-value`}>{type === 'months' ? 'Months' : distanceLabel.charAt(0).toUpperCase() + distanceLabel.slice(1)}</label>
            <input id={`${id}-value`} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} placeholder={type === 'months' ? 'e.g. 12' : 'e.g. 4,000'} required />
          </div>
        )}
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
