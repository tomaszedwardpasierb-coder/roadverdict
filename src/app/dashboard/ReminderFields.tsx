// Place at: src/app/dashboard/ReminderFields.tsx
'use client';

import styles from './dashboard.module.css';

export type RemindType = 'mileage' | 'months' | 'date';

export interface ReminderTriggerRow {
  intervalType: RemindType;
  intervalValue: string;
  exactDate: string;
}

const ALL_TYPES: RemindType[] = ['mileage', 'months', 'date'];
const TYPE_LABELS: Record<RemindType, string> = {
  mileage: 'Mileage',
  months: 'Time (months)',
  date: 'Exact date',
};

interface Props {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  triggers: ReminderTriggerRow[];
  onTriggersChange: (triggers: ReminderTriggerRow[]) => void;
  idPrefix: string;
  checkboxLabel: string;
  note?: string;
}

// Up to 3 rows, one per distinct trigger type - each row's own dropdown
// excludes whatever's already chosen in the OTHER rows, so the same type
// can never be picked twice (which wouldn't mean anything - two mileage
// triggers is just one mileage trigger with extra steps).
export function ReminderFields({ checked, onCheckedChange, triggers, onTriggersChange, idPrefix, checkboxLabel, note }: Props) {
  function updateRow(index: number, patch: Partial<ReminderTriggerRow>) {
    onTriggersChange(triggers.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function addRow() {
    const used = new Set(triggers.map((t) => t.intervalType));
    const nextType = ALL_TYPES.find((t) => !used.has(t));
    if (!nextType) return;
    onTriggersChange([...triggers, { intervalType: nextType, intervalValue: '', exactDate: '' }]);
  }

  function removeRow(index: number) {
    onTriggersChange(triggers.filter((_, i) => i !== index));
  }

  const canAddMore = checked && triggers.length < ALL_TYPES.length;

  return (
    <>
      <div className="field-checkbox">
        <label>
          <input type="checkbox" checked={checked} onChange={(e) => onCheckedChange(e.target.checked)} />
          {checkboxLabel}
        </label>
      </div>
      {checked && (
        <div style={{ marginTop: '0.6rem', paddingLeft: '1.4rem', borderLeft: '2px solid var(--amber)' }}>
          {triggers.map((trigger, i) => {
            const usedByOthers = new Set(triggers.filter((_, j) => j !== i).map((t) => t.intervalType));
            const availableTypes = ALL_TYPES.filter((t) => t === trigger.intervalType || !usedByOthers.has(t));
            return (
              <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '0.9rem' }}>
                <div className="field" style={{ marginTop: 0, flex: 1 }}>
                  {i === 0 && <label htmlFor={`${idPrefix}-type-${i}`}>Track by</label>}
                  <select
                    id={`${idPrefix}-type-${i}`}
                    value={trigger.intervalType}
                    onChange={(e) => updateRow(i, { intervalType: e.target.value as RemindType })}
                  >
                    {availableTypes.map((t) => (
                      <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ marginTop: 0, flex: 1 }}>
                  {trigger.intervalType === 'date' ? (
                    <input
                      id={`${idPrefix}-value-${i}`}
                      type="date"
                      value={trigger.exactDate}
                      onChange={(e) => updateRow(i, { exactDate: e.target.value })}
                      required
                    />
                  ) : (
                    <input
                      id={`${idPrefix}-value-${i}`}
                      type="number"
                      min="1"
                      placeholder="Interval"
                      value={trigger.intervalValue}
                      onChange={(e) => updateRow(i, { intervalValue: e.target.value })}
                      required
                    />
                  )}
                </div>
                {i > 0 && (
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => removeRow(i)}
                    aria-label="Remove this trigger"
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })}
          {canAddMore && (
            <button
              type="button"
              onClick={addRow}
              style={{ fontSize: '0.8rem', background: 'none', border: 'none', color: 'var(--amber-ink)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
            >
              + Also remind me by...
            </button>
          )}
          {triggers.length > 1 && (
            <p className="field-note" style={{ marginTop: '0.6rem' }}>
              Fires as soon as any one of these is reached - whichever comes first.
            </p>
          )}
          {note && <p className="field-note" style={{ marginTop: '0.9rem' }}>{note}</p>}
        </div>
      )}
    </>
  );
}
