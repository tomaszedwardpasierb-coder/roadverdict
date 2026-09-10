// Place at: src/app/dashboard/LogCarBillForm.tsx
//
// Car equivalent of LogBillForm.tsx. BILL_SERIES_ELIGIBLE_TYPES/
// BILL_SERIES_DEFAULT_INSTALMENT_COUNT/OWNER_SPECIFIC_BILL_TYPES
// (billTypes.ts) are reused directly - genuinely vehicle-neutral (plain
// billType-keyed lookups, no BikeDoc/CarDoc coupling).
'use client';

import { useState } from 'react';
import {
  BILL_SERIES_ELIGIBLE_TYPES,
  BILL_SERIES_DEFAULT_INSTALMENT_COUNT,
  OWNER_SPECIFIC_BILL_TYPES,
} from '@/lib/tracker/billTypes';
import { CAR_BILL_LABELS } from '@/lib/tracker/carBillTypes';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { ReminderFields, type ReminderTriggerRow } from './ReminderFields';
import { AttachmentUploader } from './AttachmentUploader';
import { isBackdated, backdateNotice } from '@/lib/tracker/backdateCheck';
import { isBeforeProduction } from '@/lib/tracker/productionYearCheck';
import { convertDisplayToGbp, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';
import type { CarReminderTrigger } from '@/lib/tracker/carReminder';
import type { BillSeriesFrequency } from '@/lib/tracker/billSeriesSchedule';

interface Props {
  currency: Currency;
  rates: ExchangeRates | null;
  carYear?: number;
  isCustomBuild?: boolean;
}

type PaymentMethod = 'one-off' | 'plan';

function rowToTrigger(row: ReminderTriggerRow): CarReminderTrigger {
  return row.intervalType === 'date'
    ? { intervalType: 'date', exactDate: row.exactDate }
    : { intervalType: row.intervalType, intervalValue: Number(row.intervalValue) };
}

export function LogCarBillForm({ currency, rates, carYear, isCustomBuild }: Props) {
  const [billType, setBillType] = useState('insurance');
  const [costDisplay, setCostDisplay] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [remindChecked, setRemindChecked] = useState(true);
  const [remindTriggers, setRemindTriggers] = useState<ReminderTriggerRow[]>([
    { intervalType: 'months', intervalValue: '12', exactDate: '' },
  ]);
  const [attachment, setAttachment] = useState<Attachment | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('one-off');
  const [frequency, setFrequency] = useState<BillSeriesFrequency>('monthly');
  const [depositDisplay, setDepositDisplay] = useState('');
  const [instalmentDisplay, setInstalmentDisplay] = useState('');
  const [instalmentCount, setInstalmentCount] = useState(String(BILL_SERIES_DEFAULT_INSTALMENT_COUNT['insurance:monthly']));
  const [collectionDay, setCollectionDay] = useState(() => String(Math.min(Number(new Date().toISOString().slice(8, 10)), 28)));
  const [alreadyPaidDisplay, setAlreadyPaidDisplay] = useState('');

  const { submit, submitting, error } = useTrackerFormSubmit('/api/cars/car-bills');
  const { submit: submitPlan, submitting: submittingPlan, error: planError } = useTrackerFormSubmit('/api/cars/car-bill-series');

  const isPlanEligible = (BILL_SERIES_ELIGIBLE_TYPES as readonly string[]).includes(billType);
  const isBeforeCarProduction = Boolean(date && isBeforeProduction(date, { year: carYear, isCustomBuild }));

  function handleBillTypeChange(newType: string) {
    setBillType(newType);
    if (!(BILL_SERIES_ELIGIBLE_TYPES as readonly string[]).includes(newType)) {
      setPaymentMethod('one-off');
    }
    const nextFrequency: BillSeriesFrequency = (OWNER_SPECIFIC_BILL_TYPES as readonly string[]).includes(newType) ? 'monthly' : frequency;
    setFrequency(nextFrequency);
    const def = BILL_SERIES_DEFAULT_INSTALMENT_COUNT[`${newType}:${nextFrequency}`];
    if (def) setInstalmentCount(String(def));
  }

  function handleFrequencyChange(newFrequency: BillSeriesFrequency) {
    setFrequency(newFrequency);
    const def = BILL_SERIES_DEFAULT_INSTALMENT_COUNT[`${billType}:${newFrequency}`];
    if (def) setInstalmentCount(String(def));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isBeforeCarProduction) return;

    if (paymentMethod === 'plan') {
      const isOwnerSpecific = (OWNER_SPECIFIC_BILL_TYPES as readonly string[]).includes(billType);
      const depositGbp = isOwnerSpecific && depositDisplay ? convertDisplayToGbp(Number(depositDisplay), currency, rates) : undefined;
      const instalmentGbp = convertDisplayToGbp(Number(instalmentDisplay), currency, rates);
      const ok = await submitPlan({
        billType,
        frequency: isOwnerSpecific ? 'monthly' : frequency,
        startDate: date,
        collectionDay: Number(collectionDay),
        depositAmount: depositGbp,
        instalmentAmount: instalmentGbp,
        instalmentCount: Number(instalmentCount),
        notes,
        instalmentsAlreadyPaid: alreadyPaidDisplay ? Number(alreadyPaidDisplay) : undefined,
      });
      if (ok) {
        setNotes('');
        setDepositDisplay('');
        setInstalmentDisplay('');
        setAlreadyPaidDisplay('');
      }
      return;
    }

    const costInGbp = convertDisplayToGbp(Number(costDisplay), currency, rates);
    const [primary, ...rest] = remindTriggers;
    const ok = await submit({
      billType,
      cost: costInGbp,
      date,
      notes,
      attachments: attachment ? [attachment] : undefined,
      reminder: remindChecked && primary ? { ...rowToTrigger(primary), additionalTriggers: rest.map(rowToTrigger) } : undefined,
    });
    if (ok) {
      setCostDisplay('');
      setNotes('');
      setAttachment(null);
    }
  }

  const symbol = CURRENCY_SYMBOLS[currency];
  const isPlan = paymentMethod === 'plan';
  const isBackdatedPlan = isPlan && !!date && isBackdated(date, new Date().toISOString());

  return (
    <form className="ticket" onSubmit={handleSubmit}>
      <div className="ticket__section">
        <span className="ticket__label">Log insurance, tax, MOT, or a charge</span>
        <div className="field">
          <label htmlFor="carbill-date">{isPlan ? 'Start date (first payment)' : 'Date'}</label>
          <input id="carbill-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          {isBeforeCarProduction && (
            <p className="error-text" role="alert" style={{ marginTop: '0.4rem' }}>
              This date is before {carYear}, when this car was made.
            </p>
          )}
          {date && isBackdated(date, new Date().toISOString()) && (
            <p className="field-note" style={{ color: 'var(--amber-ink)' }}>
              {backdateNotice(date, new Date().toISOString())} - this will be flagged in your buyer report
              (softened if you attach a receipt) to help build trust in your history, not hide it.
            </p>
          )}
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="carbill-type">Type</label>
          <select id="carbill-type" value={billType} onChange={(e) => handleBillTypeChange(e.target.value)}>
            {Object.entries(CAR_BILL_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          {(billType === 'insurance' || billType === 'finance') && (
            <p className="field-note" style={{ marginTop: '0.4rem' }}>
              {billType === 'insurance' ? 'Insurance' : 'Finance'} costs are personal to you as owner, and are excluded
              from a shareable buyer report by default.
            </p>
          )}
        </div>

        {isPlanEligible && (
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor="carbill-payment-method">How do you pay?</label>
            <select
              id="carbill-payment-method"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            >
              <option value="one-off">One-off / annual</option>
              <option value="plan">Instalment plan</option>
            </select>
          </div>
        )}

        {isPlan ? (
          <>
            {billType === 'road-tax' && (
              <div className="field" style={{ marginTop: '0.9rem' }}>
                <label htmlFor="carbill-plan-frequency">Frequency</label>
                <select
                  id="carbill-plan-frequency"
                  value={frequency}
                  onChange={(e) => handleFrequencyChange(e.target.value as BillSeriesFrequency)}
                >
                  <option value="monthly">Monthly</option>
                  <option value="six-monthly">Every 6 months</option>
                </select>
              </div>
            )}
            {(OWNER_SPECIFIC_BILL_TYPES as readonly string[]).includes(billType) && (
              <div className="field" style={{ marginTop: '0.9rem' }}>
                <label htmlFor="carbill-plan-deposit">Deposit ({symbol}) - optional, leave blank if there isn&apos;t one</label>
                <input
                  id="carbill-plan-deposit"
                  type="number"
                  min="0"
                  step="0.01"
                  value={depositDisplay}
                  onChange={(e) => setDepositDisplay(e.target.value)}
                />
              </div>
            )}
            <div className="field" style={{ marginTop: '0.9rem' }}>
              <label htmlFor="carbill-plan-instalment">
                {(OWNER_SPECIFIC_BILL_TYPES as readonly string[]).includes(billType) ? 'Regular instalment' : 'Instalment'} amount ({symbol})
              </label>
              <input
                id="carbill-plan-instalment"
                type="number"
                min="0"
                step="0.01"
                value={instalmentDisplay}
                onChange={(e) => setInstalmentDisplay(e.target.value)}
                required
              />
            </div>
            <div className="field" style={{ marginTop: '0.9rem' }}>
              <label htmlFor="carbill-plan-count">Number of payments (including the deposit, if any)</label>
              <input
                id="carbill-plan-count"
                type="number"
                min="1"
                value={instalmentCount}
                onChange={(e) => setInstalmentCount(e.target.value)}
                required
              />
              <p className="field-note">A starting suggestion, not a fixed rule - edit it to match your actual agreement.</p>
            </div>
            <div className="field" style={{ marginTop: '0.9rem' }}>
              <label htmlFor="carbill-plan-collection-day">Collection day of month (for payments after the first)</label>
              <input
                id="carbill-plan-collection-day"
                type="number"
                min="1"
                max="28"
                value={collectionDay}
                onChange={(e) => setCollectionDay(e.target.value)}
                required
              />
            </div>
            <div className="field" style={{ marginTop: '0.9rem' }}>
              <label htmlFor="carbill-plan-notes">Notes (optional)</label>
              <textarea id="carbill-plan-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. fully comprehensive, Admiral" />
            </div>
            {isBackdatedPlan && (
              <div className="field" style={{ marginTop: '0.9rem' }}>
                <label htmlFor="carbill-plan-already-paid">Instalments already paid (optional)</label>
                <input
                  id="carbill-plan-already-paid"
                  type="number"
                  min="0"
                  max={instalmentCount}
                  value={alreadyPaidDisplay}
                  onChange={(e) => setAlreadyPaidDisplay(e.target.value)}
                />
                <p className="field-note">
                  Since this plan started in the past, RoadVerdict would otherwise work out how many payments are
                  due by now itself. If that&apos;s not quite right - a payment was skipped, or landed on a different
                  day than usual - enter the real number here instead and that&apos;s what gets logged.
                </p>
              </div>
            )}
            <p className="field-note" style={{ marginTop: '0.6rem' }}>
              {alreadyPaidDisplay
                ? `${alreadyPaidDisplay} instalment${Number(alreadyPaidDisplay) === 1 ? '' : 's'} will be logged immediately as already paid.`
                : `The first payment is logged on ${date || 'the date above'}.`}{' '}
              RoadVerdict logs each later payment automatically as it comes due - nothing to log by hand.
            </p>
          </>
        ) : (
          <>
            <div className="field" style={{ marginTop: '0.9rem' }}>
              <label htmlFor="carbill-cost">Cost paid ({symbol})</label>
              <input id="carbill-cost" type="number" min="0" step="0.01" value={costDisplay} onChange={(e) => setCostDisplay(e.target.value)} required />
            </div>
            <div className="field" style={{ marginTop: '0.9rem' }}>
              <label htmlFor="carbill-notes">Notes (optional)</label>
              <textarea id="carbill-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            <div style={{ marginTop: '0.9rem' }}>
              <AttachmentUploader value={attachment} onChange={setAttachment} idSuffix="carbill" compareValues={{ cost: convertDisplayToGbp(Number(costDisplay) || 0, currency, rates), date }} />
            </div>
            <div style={{ marginTop: '0.9rem' }}>
              <ReminderFields
                checked={remindChecked}
                onCheckedChange={setRemindChecked}
                triggers={remindTriggers}
                onTriggersChange={setRemindTriggers}
                idPrefix="carbill"
                checkboxLabel="🔔 Remind me when this is due for renewal"
              />
            </div>
          </>
        )}
      </div>
      <hr className="ticket__divider" />
      <div className="ticket__section">
        <button className="submit-button" type="submit" disabled={submitting || submittingPlan || isBeforeCarProduction}>
          {isPlan ? (submittingPlan ? 'Creating plan…' : 'Start this plan') : (submitting ? 'Logging…' : 'Log it')}
        </button>
        {(error || planError) && <p className="error-text" role="alert">{error || planError}</p>}
      </div>
    </form>
  );
}
