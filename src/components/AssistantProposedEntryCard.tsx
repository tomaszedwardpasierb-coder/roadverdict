// Place at: src/components/AssistantProposedEntryCard.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { JOB_GROUPS, JOB_LABELS, JOB_REMINDER_DEFAULTS } from '@/lib/tracker/jobTypes';
import { CAR_JOB_GROUPS, CAR_JOB_LABELS, CAR_JOB_REMINDER_DEFAULTS } from '@/lib/tracker/carJobTypes';
import { BILL_LABELS, BILL_REMINDER_DEFAULTS } from '@/lib/tracker/billTypes';
import { CAR_BILL_LABELS } from '@/lib/tracker/carBillTypes';
import { MOD_GROUPS, MOD_LABELS } from '@/lib/tracker/modTypes';
import { CAR_MOD_GROUPS, CAR_MOD_LABELS } from '@/lib/tracker/carModTypes';
import { LABOUR_GROUPS, LABOUR_LABELS } from '@/lib/tracker/labourTypes';
import { CAR_LABOUR_GROUPS, CAR_LABOUR_LABELS } from '@/lib/tracker/carLabourTypes';
import { FINE_LABELS } from '@/lib/tracker/fineTypes';
import { CAR_FINE_LABELS } from '@/lib/tracker/carFineTypes';
import { TOLL_LABELS } from '@/lib/tracker/tollTypes';
import { CAR_TOLL_LABELS } from '@/lib/tracker/carTollTypes';
import { ReminderFields, type ReminderTriggerRow } from '@/app/dashboard/ReminderFields';
import type { ReminderTrigger } from '@/lib/tracker/reminder';
import { VehicleSpinner } from './VehicleSpinner';
import styles from './AssistantProposedEntryCard.module.css';

// entryId is only ever set by an edit draft (proposeEditEntry) - its
// presence, not a separate flag, is what tells this card to PATCH
// <endpoint>/<entryId> and say "Save changes"/"Updated" instead of
// POSTing a brand-new entry and saying "Log it"/"Logged".
export interface ProposedServiceEntry {
  category: 'service';
  jobType: string;
  jobLabel: string;
  description: string;
  cost: number;
  date: string;
  mileage: number;
  mileageNote?: string;
  // Same reasoning as ProposedLabourEntry's own vehicleKind below - a
  // Service entry can now be drafted from either vehicle kind.
  vehicleKind: 'bike' | 'car';
  entryId?: string;
}

export interface ProposedBillEntry {
  category: 'bill';
  billType: string;
  billLabel: string;
  description: string;
  cost: number;
  date: string;
  vehicleKind: 'bike' | 'car';
  entryId?: string;
}

export interface ProposedModEntry {
  category: 'mod';
  modCategory: string;
  modLabel: string;
  description: string;
  cost: number;
  date: string;
  mileage: number;
  mileageNote?: string;
  vehicleKind: 'bike' | 'car';
  entryId?: string;
}

export interface ProposedFuelEntry {
  category: 'fuel';
  // litres for anything with an engine, kwh for an EV charging session -
  // never both. Bike always uses litres; which one a car draft carries
  // depends on that car's own fuelType, decided server-side.
  litres?: number;
  kwh?: number;
  cost: number;
  date: string;
  mileage: number;
  mileageNote?: string;
  filledToFull: boolean;
  vehicleKind: 'bike' | 'car';
  entryId?: string;
}

export interface ProposedLabourEntry {
  category: 'labour';
  labourCategory: string;
  labourLabel: string;
  description: string;
  cost: number;
  date: string;
  mileage: number;
  mileageNote?: string;
  // The only variant that can come from either vehicle kind - carried on
  // the entry itself (see assistantTools.ts's ProposedEntry type) so this
  // card knows which catalog to render and which endpoint to post to
  // without re-resolving the account's active vehicle a second time.
  vehicleKind: 'bike' | 'car';
  entryId?: string;
}

export interface ProposedFineEntry {
  category: 'fine';
  fineType: string;
  fineLabel: string;
  description: string;
  cost: number;
  date: string;
  // Same reasoning as ProposedLabourEntry's own vehicleKind above - a
  // Fine can be drafted from either vehicle kind.
  vehicleKind: 'bike' | 'car';
  entryId?: string;
}

export interface ProposedTollEntry {
  category: 'toll';
  tollType: string;
  tollLabel: string;
  description: string;
  cost: number;
  date: string;
  vehicleKind: 'bike' | 'car';
  entryId?: string;
}

export type ProposedEntry =
  | ProposedServiceEntry
  | ProposedBillEntry
  | ProposedModEntry
  | ProposedFuelEntry
  | ProposedLabourEntry
  | ProposedFineEntry
  | ProposedTollEntry;

// Every category now varies by vehicle kind - a plain lookup table isn't
// enough any more, so getEndpoint below handles all seven directly. The
// base path is identical whether creating or editing - editing (see
// entry.entryId) just appends /<id> and the caller switches to PATCH,
// same convention every one of these REST routes already follows.
function getBaseEndpoint(entry: ProposedEntry): string {
  const isCar = entry.vehicleKind === 'car';
  switch (entry.category) {
    case 'service':
      return isCar ? '/api/cars/car-services' : '/api/tracker/services';
    case 'bill':
      return isCar ? '/api/cars/car-bills' : '/api/tracker/bills';
    case 'mod':
      return isCar ? '/api/cars/car-mods' : '/api/tracker/mods';
    case 'fuel':
      return isCar ? '/api/cars/car-fuel' : '/api/tracker/fuel';
    case 'labour':
      return isCar ? '/api/cars/car-labour' : '/api/tracker/labour';
    case 'fine':
      return isCar ? '/api/cars/car-fines' : '/api/tracker/fines';
    case 'toll':
      return isCar ? '/api/cars/car-tolls' : '/api/tracker/tolls';
  }
}

function getEndpoint(entry: ProposedEntry): string {
  const base = getBaseEndpoint(entry);
  return entry.entryId ? `${base}/${entry.entryId}` : base;
}

function cardTitle(entry: ProposedEntry): string {
  const prefix = entry.entryId ? 'Edit' : 'New';
  if (entry.category === 'fuel') {
    return `${prefix} ${entry.kwh !== undefined ? 'charging session' : 'fuel log'}`;
  }
  const NOUNS: Record<Exclude<ProposedEntry['category'], 'fuel'>, string> = {
    service: 'service record',
    bill: 'bill',
    mod: 'modification/accessory',
    labour: 'labour entry',
    fine: 'fine',
    toll: 'toll/parking charge',
  };
  return `${prefix} ${NOUNS[entry.category]}`;
}

// Reminder defaults, keyed by category and vehicle kind - the same
// defaults the manual dashboard forms already use (see
// LogServiceForm.tsx/LogCarServiceForm.tsx/BillCard.tsx/
// LogCarBillForm.tsx). A car bill has no default interval of its own
// (no CAR_BILL_REMINDER_DEFAULTS exists) - LogCarBillForm.tsx's own
// answer to that is to default remindChecked to true anyway with a
// flat 12-month fallback, matched here for the same reason: a car's
// recurring bills (insurance/tax/MOT) are exactly the kind of thing
// worth reminding about even without a per-type interval to suggest.
function reminderDefault(entry: ProposedEntry): { checked: boolean; type: 'mileage' | 'months' | 'date'; value: string } {
  if (entry.category === 'service') {
    const def = (entry.vehicleKind === 'car' ? CAR_JOB_REMINDER_DEFAULTS : JOB_REMINDER_DEFAULTS)[entry.jobType];
    return { checked: Boolean(def), type: def ? def.type : 'mileage', value: def ? String(def.value) : '' };
  }
  if (entry.category === 'bill') {
    if (entry.vehicleKind === 'car') {
      return { checked: true, type: 'months', value: '12' };
    }
    const def = BILL_REMINDER_DEFAULTS[entry.billType];
    return { checked: Boolean(def), type: def ? def.type : 'months', value: def ? String(def.value) : '12' };
  }
  return { checked: false, type: 'mileage', value: '' };
}

// Renders the AI assistant's draft for a new (or, when entry.entryId is
// set, an edited-existing) service record, bill, modification/
// accessory, fuel/charging log, labour entry, fine, or toll/parking
// charge - pre-filled but fully editable. Confirming always POSTs (new)
// or PATCHes (edit) the exact same endpoint the manual dashboard forms
// use, so every existing server-side check (mileage consistency,
// production-year, litres plausibility, etc.) still applies. This never
// writes anything on its own; only the person's own click does.
export function AssistantProposedEntryCard({ entry }: { entry: ProposedEntry }) {
  const router = useRouter();
  const isCar = entry.vehicleKind === 'car';
  const [jobType, setJobType] = useState(entry.category === 'service' ? entry.jobType : '');
  const [billType, setBillType] = useState(entry.category === 'bill' ? entry.billType : '');
  const [modCategory, setModCategory] = useState(entry.category === 'mod' ? entry.modCategory : '');
  const [labourCategory, setLabourCategory] = useState(entry.category === 'labour' ? entry.labourCategory : '');
  const [fineType, setFineType] = useState(entry.category === 'fine' ? entry.fineType : '');
  const [tollType, setTollType] = useState(entry.category === 'toll' ? entry.tollType : '');
  const [description, setDescription] = useState(entry.category !== 'fuel' ? entry.description : '');
  const [cost, setCost] = useState(String(entry.cost));
  const [date, setDate] = useState(entry.date);
  // Fine and Toll carry no mileage at all, same as Bill - all three are
  // excluded here and everywhere else this same check appears. Written
  // as the same inline discriminant check every time (not a shared
  // boolean) so TypeScript can actually narrow `entry` at each site.
  const [mileage, setMileage] = useState(
    entry.category !== 'bill' && entry.category !== 'fine' && entry.category !== 'toll' ? String(entry.mileage) : ''
  );
  // Cleared the moment the person edits the field themselves - same
  // "their own figure always wins" rule useEstimatedMileage.ts follows
  // for the manual dashboard forms, so a stale estimate note never sits
  // under a number the person has since overridden.
  const [mileageNote, setMileageNote] = useState(
    entry.category !== 'bill' && entry.category !== 'fine' && entry.category !== 'toll' ? entry.mileageNote ?? null : null
  );
  // Which fuel field applies is decided once, from whichever the draft
  // itself arrived with - kwh only ever appears for an electric car.
  const isElectricFuel = entry.category === 'fuel' && entry.kwh !== undefined;
  const [litres, setLitres] = useState(entry.category === 'fuel' ? String(entry.litres ?? '') : '');
  const [kwh, setKwh] = useState(entry.category === 'fuel' ? String(entry.kwh ?? '') : '');
  const [filledToFull, setFilledToFull] = useState(entry.category === 'fuel' ? entry.filledToFull : false);
  const [mileageAcknowledged, setMileageAcknowledged] = useState(false);

  // Service and Bill are the only categories with a real reminder
  // concept (see reminderDefault above) - both start pre-filled with
  // the same default the manual forms would suggest for this exact
  // job/bill type, review-and-edit just like everything else on this
  // card, never silently applied.
  const canRemind = entry.category === 'service' || entry.category === 'bill';
  const initialReminder = reminderDefault(entry);
  const [remindChecked, setRemindChecked] = useState(initialReminder.checked);
  const [remindTriggers, setRemindTriggers] = useState<ReminderTriggerRow[]>([
    { intervalType: initialReminder.type, intervalValue: initialReminder.value, exactDate: '' },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logged, setLogged] = useState(false);

  // Re-suggests the reminder default when the person changes which job
  // or bill type this actually is - same behaviour as LogServiceForm.tsx's
  // own handleJobChange, since this card is drafting something new, not
  // editing something that already exists.
  function applyReminderDefault(nextEntry: ProposedEntry) {
    const def = reminderDefault(nextEntry);
    setRemindChecked(def.checked);
    setRemindTriggers([{ intervalType: def.type, intervalValue: def.value, exactDate: '' }]);
  }
  function handleJobTypeChange(next: string) {
    setJobType(next);
    if (entry.category === 'service') applyReminderDefault({ ...entry, jobType: next });
  }
  function handleBillTypeChange(next: string) {
    setBillType(next);
    if (entry.category === 'bill') applyReminderDefault({ ...entry, billType: next });
  }

  function rowToTrigger(row: ReminderTriggerRow): ReminderTrigger {
    return row.intervalType === 'date'
      ? { intervalType: 'date', exactDate: row.exactDate }
      : { intervalType: row.intervalType, intervalValue: Number(row.intervalValue) };
  }

  async function handleConfirm(acknowledgeMileage: boolean) {
    setSubmitting(true);
    setError(null);

    const costValue = Number(cost);
    if (!Number.isFinite(costValue) || costValue <= 0) {
      setError('Enter a valid cost.');
      setSubmitting(false);
      return;
    }
    if (entry.category === 'fuel') {
      const amount = Number(isElectricFuel ? kwh : litres);
      if (!Number.isFinite(amount) || amount <= 0) {
        setError(isElectricFuel ? 'Enter a valid number of kWh.' : 'Enter a valid number of litres.');
        setSubmitting(false);
        return;
      }
    }

    const mileageAck = acknowledgeMileage || mileageAcknowledged;
    let reminder: (ReminderTrigger & { additionalTriggers?: ReminderTrigger[] }) | undefined;
    if (canRemind && remindChecked && remindTriggers.length > 0) {
      const [primary, ...rest] = remindTriggers.map(rowToTrigger);
      reminder = rest.length > 0 ? { ...primary, additionalTriggers: rest } : primary;
    }

    const body =
      entry.category === 'service'
        ? { jobType, cost: costValue, mileage: Number(mileage), date, notes: description, mileageAcknowledged: mileageAck, reminder }
        : entry.category === 'bill'
        ? { billType, cost: costValue, date, notes: description, reminder }
        : entry.category === 'mod'
        ? { category: modCategory, name: description, cost: costValue, mileage: Number(mileage), date, mileageAcknowledged: mileageAck }
        : entry.category === 'labour'
        ? { category: labourCategory, cost: costValue, mileage: Number(mileage), date, notes: description, mileageAcknowledged: mileageAck }
        : entry.category === 'fine'
        ? { fineType, cost: costValue, date, notes: description }
        : entry.category === 'toll'
        ? { tollType, cost: costValue, date, notes: description }
        : isElectricFuel
        ? { kwh: Number(kwh), cost: costValue, mileage: Number(mileage), date, filledToFull: false, mileageAcknowledged: mileageAck }
        : { litres: Number(litres), cost: costValue, mileage: Number(mileage), date, filledToFull, mileageAcknowledged: mileageAck };

    try {
      const res = await fetch(getEndpoint(entry), {
        method: entry.entryId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Something went wrong. Try again.');
        setSubmitting(false);
        return;
      }
      setLogged(true);
      setSubmitting(false);
      router.refresh();
    } catch {
      setError('Could not reach RoadVerdict. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  if (logged) {
    const label =
      entry.category === 'service' ? ((isCar ? CAR_JOB_LABELS : JOB_LABELS)[jobType] ?? jobType)
      : entry.category === 'bill' ? ((isCar ? CAR_BILL_LABELS : BILL_LABELS)[billType] ?? billType)
      : entry.category === 'mod' ? ((isCar ? CAR_MOD_LABELS : MOD_LABELS)[modCategory] ?? modCategory)
      : entry.category === 'labour' ? ((isCar ? CAR_LABOUR_LABELS : LABOUR_LABELS)[labourCategory] ?? labourCategory)
      : entry.category === 'fine' ? ((isCar ? CAR_FINE_LABELS : FINE_LABELS)[fineType] ?? fineType)
      : entry.category === 'toll' ? ((isCar ? CAR_TOLL_LABELS : TOLL_LABELS)[tollType] ?? tollType)
      : isElectricFuel ? 'Charging session' : 'Fuel fill-up';
    return (
      <div className={styles.card}>
        <p className={styles.loggedNote}>{entry.entryId ? `✓ Updated - ${label}` : `✓ Logged - ${label}`}</p>
      </div>
    );
  }

  // A heuristic, not a status code check (fetch here doesn't carry one
  // through) - every mileage-consistency message from describeMileageCheck
  // mentions "miles", which nothing else these endpoints return does.
  // Fine and Toll never carry mileage, so they can never trigger this in
  // the first place - excluded the same way Bill already was.
  const offerMileageOverride =
    entry.category !== 'bill' && entry.category !== 'fine' && entry.category !== 'toll' && !!error && /miles/i.test(error) && !mileageAcknowledged;

  const spinnerKind: 'bike' | 'car' = entry.vehicleKind;

  return (
    <div className={styles.card}>
      <span className={styles.cardLabel}>{cardTitle(entry)}</span>

      {entry.category === 'service' && (
        <div className={styles.field}>
          <label htmlFor="ai-job-type">Job</label>
          <select id="ai-job-type" value={jobType} onChange={(e) => handleJobTypeChange(e.target.value)} disabled={submitting}>
            {(isCar ? CAR_JOB_GROUPS : JOB_GROUPS).map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.jobs.map((j) => (
                  <option key={j} value={j}>{(isCar ? CAR_JOB_LABELS : JOB_LABELS)[j]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      {entry.category === 'bill' && (
        <div className={styles.field}>
          <label htmlFor="ai-bill-type">Bill type</label>
          <select id="ai-bill-type" value={billType} onChange={(e) => handleBillTypeChange(e.target.value)} disabled={submitting}>
            {Object.entries(isCar ? CAR_BILL_LABELS : BILL_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      )}

      {entry.category === 'mod' && (
        <div className={styles.field}>
          <label htmlFor="ai-mod-category">Category</label>
          <select id="ai-mod-category" value={modCategory} onChange={(e) => setModCategory(e.target.value)} disabled={submitting}>
            {(isCar ? CAR_MOD_GROUPS : MOD_GROUPS).map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.subgroups.flatMap((sg) => sg.mods).map((m) => (
                  <option key={m} value={m}>{(isCar ? CAR_MOD_LABELS : MOD_LABELS)[m]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      {entry.category === 'labour' && (
        <div className={styles.field}>
          <label htmlFor="ai-labour-category">Category</label>
          <select id="ai-labour-category" value={labourCategory} onChange={(e) => setLabourCategory(e.target.value)} disabled={submitting}>
            {(isCar ? CAR_LABOUR_GROUPS : LABOUR_GROUPS).map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.jobs.map((j) => (
                  <option key={j} value={j}>{(isCar ? CAR_LABOUR_LABELS : LABOUR_LABELS)[j]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      {entry.category === 'fine' && (
        <div className={styles.field}>
          <label htmlFor="ai-fine-type">Type of fine</label>
          <select id="ai-fine-type" value={fineType} onChange={(e) => setFineType(e.target.value)} disabled={submitting}>
            {Object.entries(isCar ? CAR_FINE_LABELS : FINE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      )}

      {entry.category === 'toll' && (
        <div className={styles.field}>
          <label htmlFor="ai-toll-type">Toll or charge</label>
          <select id="ai-toll-type" value={tollType} onChange={(e) => setTollType(e.target.value)} disabled={submitting}>
            {Object.entries(isCar ? CAR_TOLL_LABELS : TOLL_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      )}

      {entry.category !== 'fuel' && (
        <div className={styles.field}>
          <label htmlFor="ai-description">Description</label>
          <input id="ai-description" type="text" value={description} onChange={(e) => setDescription(e.target.value)} disabled={submitting} />
        </div>
      )}

      {entry.category === 'fuel' && (
        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="ai-fuel-amount">{isElectricFuel ? 'kWh' : 'Litres'}</label>
            <input
              id="ai-fuel-amount"
              type="number"
              min="0"
              step="0.01"
              value={isElectricFuel ? kwh : litres}
              onChange={(e) => (isElectricFuel ? setKwh(e.target.value) : setLitres(e.target.value))}
              disabled={submitting}
            />
          </div>
          {!isElectricFuel && (
            <label className={styles.checkboxField}>
              <input type="checkbox" checked={filledToFull} onChange={(e) => setFilledToFull(e.target.checked)} disabled={submitting} />
              Filled to full
            </label>
          )}
        </div>
      )}

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="ai-cost">Cost (£)</label>
          <input id="ai-cost" type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} disabled={submitting} />
        </div>
        <div className={styles.field}>
          <label htmlFor="ai-date">Date</label>
          <input id="ai-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={submitting} />
        </div>
      </div>

      {entry.category !== 'bill' && entry.category !== 'fine' && entry.category !== 'toll' && (
        <div className={styles.field}>
          <label htmlFor="ai-mileage">Mileage</label>
          <input
            id="ai-mileage"
            type="number"
            min="0"
            value={mileage}
            onChange={(e) => {
              setMileage(e.target.value);
              setMileageNote(null);
            }}
            disabled={submitting}
          />
          {mileageNote && <p className={styles.mileageNote}>{mileageNote}</p>}
        </div>
      )}

      {canRemind && (
        <ReminderFields
          checked={remindChecked}
          onCheckedChange={setRemindChecked}
          triggers={remindTriggers}
          onTriggersChange={setRemindTriggers}
          idPrefix={`ai-remind-${entry.category}`}
          checkboxLabel={entry.category === 'service' ? '🔔 Remind me when this is due again' : '🔔 Remind me when this is due for renewal'}
        />
      )}

      {error && <p className={styles.errorNote} role="alert">{error}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.confirmBtn} onClick={() => handleConfirm(false)} disabled={submitting}>
          {submitting && <VehicleSpinner kind={spinnerKind} size={20} />}
          {entry.entryId ? (submitting ? 'Saving…' : 'Save changes') : (submitting ? 'Logging…' : 'Log it')}
        </button>
        {offerMileageOverride && (
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => {
              setMileageAcknowledged(true);
              handleConfirm(true);
            }}
            disabled={submitting}
          >
            {entry.entryId ? 'Save anyway' : 'Log it anyway'}
          </button>
        )}
      </div>
    </div>
  );
}
