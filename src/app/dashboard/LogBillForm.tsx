// Place at: src/app/dashboard/LogBillForm.tsx
'use client';

import { useState } from 'react';
import {
  BILL_LABELS,
  BILL_REMINDER_DEFAULTS,
  BILL_SERIES_ELIGIBLE_TYPES,
  BILL_SERIES_DEFAULT_INSTALMENT_COUNT,
} from '@/lib/tracker/billTypes';
import { convertDisplayToGbp, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { AttachmentUploader } from './AttachmentUploader';
import { ReminderFields, type ReminderTriggerRow } from './ReminderFields';
import { isBackdated, backdateNotice } from '@/lib/tracker/backdateCheck';
import { isBeforeProduction } from '@/lib/tracker/productionYearCheck';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';
import type { ReminderTrigger } from '@/lib/tracker/reminder';
import type { BillSeriesFrequency } from '@/lib/tracker/billSeriesSchedule';
import styles from './dashboard.module.css';

type PaymentMethod = 'one-off' | 'plan';

export function LogBillForm({
  currency,
  rates,
  bikeYear,
  isCustomBuild,
}: {
  currency: Currency;
  rates: ExchangeRates | null;
  bikeYear?: number;
  isCustomBuild?: boolean;
}) {
  const [billType, setBillType] = useState('insurance');
  const [costDisplay, setCostDisplay] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [remindChecked, setRemindChecked] = useState(true);
  const [remindTriggers, setRemindTriggers] = useState<ReminderTriggerRow[]>([
    { intervalType: 'months', intervalValue: '12', exactDate: '' },
  ]);
  const [attachment, setAttachment] = useState<Attachment | null>(null);

  // Only insurance and road tax can be a recurring plan - MOT stays a
  // one-off with zero UI change, so this question never even renders
  // for it.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('one-off');
  const [frequency, setFrequency] = useState<BillSeriesFrequency>('monthly');
  const [depositDisplay, setDepositDisplay] = useState('');
  const [instalmentDisplay, setInstalmentDisplay] = useState('');
  const [instalmentCount, setInstalmentCount] = useState(String(BILL_SERIES_DEFAULT_INSTALMENT_COUNT['insurance:monthly']));
  const [collectionDay, setCollectionDay] = useState(() => String(Math.min(Number(new Date().toISOString().slice(8, 10)), 28)));

  const { submit, submitting, error } = useTrackerFormSubmit('/api/tracker/bills');
  const { submit: submitPlan, submitting: submittingPlan, error: planError } = useTrackerFormSubmit('/api/tracker/bill-series');

  const isPlanEligible = (BILL_SERIES_ELIGIBLE_TYPES as readonly string[]).includes(billType);

  function handleBillTypeChange(newType: string) {
    setBillType(newType);
    if (remindChecked) {
      const def = BILL_REMINDER_DEFAULTS[newType];
      setRemindTriggers([{ intervalType: def ? def.type : 'months', intervalValue: def ? String(def.value) : '12', exactDate: '' }]);
    }
    if (!(BILL_SERIES_ELIGIBLE_TYPES as readonly string[]).includes(newType)) {
      setPaymentMethod('one-off');
    }
    // Insurance plans are always monthly - only road tax offers a choice
    // of frequency, since DVLA's own scheme is the only one with two
    // real cadences.
    const nextFrequency: BillSeriesFrequency = newType === 'insurance' ? 'monthly' : frequency;
    setFrequency(nextFrequency);
    const def = BILL_SERIES_DEFAULT_INSTALMENT_COUNT[`${newType}:${nextFrequency}`];
    if (def) setInstalmentCount(String(def));
  }

  function handleFrequencyChange(newFrequency: BillSeriesFrequency) {
    setFrequency(newFrequency);
    const def = BILL_SERIES_DEFAULT_INSTALMENT_COUNT[`${billType}:${newFrequency}`];
    if (def) setInstalmentCount(String(def));
  }

  function rowToTrigger(row: ReminderTriggerRow): ReminderTrigger {
    return row.intervalType === 'date'
      ? { intervalType: 'date', exactDate: row.exactDate }
      : { intervalType: row.intervalType, intervalValue: Number(row.intervalValue) };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (date && isBeforeProduction(date, { year: bikeYear, isCustomBuild })) return;

    if (paymentMethod === 'plan') {
      const depositGbp = billType === 'insurance' && depositDisplay ? convertDisplayToGbp(Number(depositDisplay), currency, rates) : undefined;
      const instalmentGbp = convertDisplayToGbp(Number(instalmentDisplay), currency, rates);
      const ok = await submitPlan({
        billType,
        frequency: billType === 'insurance' ? 'monthly' : frequency,
        startDate: date,
        collectionDay: Number(collectionDay),
        depositAmount: depositGbp,
        instalmentAmount: instalmentGbp,
        instalmentCount: Number(instalmentCount),
        notes,
      });
      if (ok) {
        setNotes('');
        setDepositDisplay('');
        setInstalmentDisplay('');
      }
      return;
    }

    const costInGbp = convertDisplayToGbp(Number(costDisplay), currency, rates);
    const body: {
      billType: string;
      cost: number;
      date: string;
      notes: string;
      attachments?: Attachment[];
      reminder?: ReminderTrigger & { additionalTriggers?: ReminderTrigger[] };
    } = { billType, cost: costInGbp, date, notes, attachments: attachment ? [attachment] : undefined };

    if (remindChecked && remindTriggers.length > 0) {
      const [primary, ...rest] = remindTriggers.map(rowToTrigger);
      body.reminder = rest.length > 0 ? { ...primary, additionalTriggers: rest } : primary;
    }

    const ok = await submit(body);
    if (ok) {
      setCostDisplay('');
      setNotes('');
      setAttachment(null);
    }
  }

  const symbol = CURRENCY_SYMBOLS[currency];
  const isPlan = paymentMethod === 'plan';

  return (
    <form className="ticket" onSubmit={handleSubmit}>
      <div className="ticket__section">
        <span className="ticket__label">Log insurance, tax, or an MOT</span>
        <div className="field">
          <label htmlFor="bill-date">{isPlan ? 'Start date (first payment)' : 'Date'}</label>
          <input id="bill-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          {date && isBeforeProduction(date, { year: bikeYear, isCustomBuild }) && (
            <p className="error-text" role="alert">
              This date is before {bikeYear}, when this bike was made - it couldn&apos;t have been insured, taxed, or
              tested before it existed. Double-check the date.
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
          <label htmlFor="bill-type">Type</label>
          <select id="bill-type" value={billType} onChange={(e) => handleBillTypeChange(e.target.value)}>
            {Object.entries(BILL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          {billType === 'insurance' && (
            <p className="field-note" style={{ color: 'var(--amber-ink)' }}>
              Insurance costs are personal to you and won&apos;t appear in your shareable report by default - a new
              owner&apos;s premium will be different. You can change this in your Insurance, Tax &amp; MOT settings
              if you&apos;d rather show it anyway.
            </p>
          )}
        </div>

        {isPlanEligible && (
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor="bill-payment-method">How do you pay?</label>
            <select
              id="bill-payment-method"
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
                <label htmlFor="bill-plan-frequency">Frequency</label>
                <select
                  id="bill-plan-frequency"
                  value={frequency}
                  onChange={(e) => handleFrequencyChange(e.target.value as BillSeriesFrequency)}
                >
                  <option value="monthly">Monthly</option>
                  <option value="six-monthly">Every 6 months</option>
                </select>
              </div>
            )}
            {billType === 'insurance' && (
              <div className="field" style={{ marginTop: '0.9rem' }}>
                <label htmlFor="bill-plan-deposit">Deposit ({symbol}) - optional, leave blank if there isn&apos;t one</label>
                <input
                  id="bill-plan-deposit"
                  type="number"
                  min="0"
                  step="0.01"
                  value={depositDisplay}
                  onChange={(e) => setDepositDisplay(e.target.value)}
                />
              </div>
            )}
            <div className="field" style={{ marginTop: '0.9rem' }}>
              <label htmlFor="bill-plan-instalment">
                {billType === 'insurance' ? 'Regular instalment' : 'Instalment'} amount ({symbol})
              </label>
              <input
                id="bill-plan-instalment"
                type="number"
                min="0"
                step="0.01"
                value={instalmentDisplay}
                onChange={(e) => setInstalmentDisplay(e.target.value)}
                required
              />
            </div>
            <div className="field" style={{ marginTop: '0.9rem' }}>
              <label htmlFor="bill-plan-count">Number of payments (including the deposit, if any)</label>
              <input
                id="bill-plan-count"
                type="number"
                min="1"
                value={instalmentCount}
                onChange={(e) => setInstalmentCount(e.target.value)}
                required
              />
              <p className="field-note">A starting suggestion, not a fixed rule - edit it to match your actual agreement.</p>
            </div>
            <div className="field" style={{ marginTop: '0.9rem' }}>
              <label htmlFor="bill-plan-collection-day">Collection day of month (for payments after the first)</label>
              <input
                id="bill-plan-collection-day"
                type="number"
                min="1"
                max="28"
                value={collectionDay}
                onChange={(e) => setCollectionDay(e.target.value)}
                required
              />
            </div>
            <div className="field" style={{ marginTop: '0.9rem' }}>
              <label htmlFor="bill-plan-notes">Notes (optional)</label>
              <textarea id="bill-plan-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. fully comprehensive, Bennetts" />
            </div>
            <p className="field-note" style={{ marginTop: '0.6rem' }}>
              The first payment is logged on {date || 'the date above'}. RoadVerdict logs each later payment
              automatically as it comes due - nothing to log by hand.
            </p>
          </>
        ) : (
          <>
            <div className="field" style={{ marginTop: '0.9rem' }}>
              <label htmlFor="bill-cost">Cost ({symbol})</label>
              <input id="bill-cost" type="number" min="0" step="0.01" value={costDisplay} onChange={(e) => setCostDisplay(e.target.value)} required />
            </div>
            <div className="field" style={{ marginTop: '0.9rem' }}>
              <label htmlFor="bill-notes">Notes (optional)</label>
              <textarea id="bill-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. fully comprehensive, Bennetts" />
            </div>
            <AttachmentUploader value={attachment} onChange={setAttachment} idSuffix="-bill" compareValues={{ cost: convertDisplayToGbp(Number(costDisplay), currency, rates), date }} />

            <ReminderFields
              checked={remindChecked}
              onCheckedChange={setRemindChecked}
              triggers={remindTriggers}
              onTriggersChange={setRemindTriggers}
              idPrefix="remind-bill"
              checkboxLabel="🔔 Remind me when this is due for renewal"
            />
          </>
        )}
      </div>
      <hr className="ticket__divider" />
      <div className="ticket__section">
        <button
          className={styles.scanReceiptBtn}
          type="submit"
          disabled={submitting || submittingPlan || (date ? isBeforeProduction(date, { year: bikeYear, isCustomBuild }) : false)}
        >
          {isPlan ? (submittingPlan ? 'Creating plan…' : 'Start this plan') : (submitting ? 'Logging…' : 'Log it')}
        </button>
        {(error || planError) && <p className="error-text" role="alert">{error || planError}</p>}
      </div>
    </form>
  );
}
