// Place at: src/app/dashboard/CustomFilterPanel.tsx
'use client';

import { useState } from 'react';
import { JOB_LABELS, JOB_GROUPS } from '@/lib/tracker/jobTypes';
import { MOD_LABELS, MOD_GROUPS, MOD_LABEL_TO_KEY, findGroupForCategory } from '@/lib/tracker/modTypes';
import { BILL_LABELS } from '@/lib/tracker/billTypes';
import { formatCurrency, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import styles from './dashboard.module.css';

type Category = 'service' | 'mods' | 'bills' | 'fuel';

interface ServiceItem { jobType: string; date: string; cost: number }
interface ModItem { category: string; name: string; date: string; cost: number }
interface BillItem { billType: string; date: string; cost: number }
interface FuelItem { date: string; cost: number }

interface Props {
  records: ServiceItem[];
  mods: ModItem[];
  bills: BillItem[];
  fuelLogs: FuelItem[];
  currency: Currency;
  rates: ExchangeRates | null;
}

interface ResultEntry {
  date: string;
  description: string;
  cost: number;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const ALL_MODS_GROUP = '__all__';

export function CustomFilterPanel({ records, mods, bills, fuelLogs, currency, rates }: Props) {
  const [category, setCategory] = useState<Category>('service');
  const [serviceJob, setServiceJob] = useState('all');
  const [modGroup, setModGroup] = useState(ALL_MODS_GROUP);
  const [modItem, setModItem] = useState('all');
  const [modSearch, setModSearch] = useState('');
  const [billType, setBillType] = useState('all');
  const [dateMode, setDateMode] = useState<'range' | 'lastN'>('range');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [lastNDays, setLastNDays] = useState('30');

  function handleCategoryChange(next: Category) {
    setCategory(next);
    setServiceJob('all');
    setModGroup(ALL_MODS_GROUP);
    setModItem('all');
    setModSearch('');
    setBillType('all');
  }

  function handleModGroupChange(group: string) {
    setModGroup(group);
    setModItem('all');
  }

  function handleModSearch(value: string) {
    setModSearch(value);
    const matchedKey = MOD_LABEL_TO_KEY[value];
    if (matchedKey) {
      setModGroup(findGroupForCategory(matchedKey));
      setModItem(matchedKey);
    }
  }

  function inDateFilter(dateStr: string): boolean {
    const d = new Date(dateStr);
    if (dateMode === 'lastN') {
      const n = Number(lastNDays);
      if (!Number.isFinite(n) || n <= 0) return true;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - n);
      return d >= cutoff;
    }
    if (fromDate && d < new Date(fromDate)) return false;
    if (toDate && d > new Date(toDate)) return false;
    return true;
  }

  let entries: ResultEntry[] = [];

  if (category === 'service') {
    entries = records
      .filter((r) => (serviceJob === 'all' || r.jobType === serviceJob) && inDateFilter(r.date))
      .map((r) => ({ date: r.date, description: JOB_LABELS[r.jobType] ?? r.jobType, cost: r.cost }));
  } else if (category === 'mods') {
    entries = mods
      .filter((m) => {
        if (modItem !== 'all') return m.category === modItem && inDateFilter(m.date);
        if (modGroup !== ALL_MODS_GROUP) {
          const groupData = MOD_GROUPS.find((g) => g.group === modGroup);
          const keysInGroup = groupData?.subgroups.flatMap((sg) => sg.mods) ?? [];
          return keysInGroup.includes(m.category) && inDateFilter(m.date);
        }
        return inDateFilter(m.date);
      })
      .map((m) => ({ date: m.date, description: `${MOD_LABELS[m.category] ?? m.category}: ${m.name}`, cost: m.cost }));
  } else if (category === 'bills') {
    entries = bills
      .filter((b) => (billType === 'all' || b.billType === billType) && inDateFilter(b.date))
      .map((b) => ({ date: b.date, description: BILL_LABELS[b.billType] ?? b.billType, cost: b.cost }));
  } else {
    entries = fuelLogs.filter((f) => inDateFilter(f.date)).map((f) => ({ date: f.date, description: 'Fuel fill-up', cost: f.cost }));
  }

  entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const total = entries.reduce((sum, e) => sum + e.cost, 0);
  const modGroupData = MOD_GROUPS.find((g) => g.group === modGroup);

  return (
    <div className={styles.chartCard} style={{ gridColumn: '1 / -1' }}>
      <div className={styles.chartCardTitle}>Look something up</div>
      <p className="field-note" style={{ marginBottom: '0.8rem' }}>
        e.g. what did tyres cost you last year, or how much has fuel cost you in the last 30 days.
      </p>

      <div className="field">
        <label htmlFor="lookup-category">Category</label>
        <select id="lookup-category" value={category} onChange={(e) => handleCategoryChange(e.target.value as Category)}>
          <option value="service">Service</option>
          <option value="mods">Modifications & accessories</option>
          <option value="bills">Insurance, tax & MOT</option>
          <option value="fuel">Fuel</option>
        </select>
      </div>

      {category === 'service' && (
        <div className="field" style={{ marginTop: '0.7rem' }}>
          <label htmlFor="lookup-service-item">Item</label>
          <select id="lookup-service-item" value={serviceJob} onChange={(e) => setServiceJob(e.target.value)}>
            <option value="all">All servicing</option>
            {JOB_GROUPS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.jobs.map((j) => (
                  <option key={j} value={j}>{JOB_LABELS[j]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      {category === 'mods' && (
        <>
          <div className="field" style={{ marginTop: '0.7rem' }}>
            <label htmlFor="lookup-mod-search">Search for an item</label>
            <input
              id="lookup-mod-search"
              type="text"
              list="lookup-mod-datalist"
              value={modSearch}
              onChange={(e) => handleModSearch(e.target.value)}
              placeholder="e.g. tank bag, disc lock..."
            />
            <datalist id="lookup-mod-datalist">
              {Object.keys(MOD_LABEL_TO_KEY).map((label) => (
                <option key={label} value={label} />
              ))}
            </datalist>
          </div>
          <div className="field" style={{ marginTop: '0.7rem' }}>
            <label htmlFor="lookup-mod-group">Group</label>
            <select id="lookup-mod-group" value={modGroup} onChange={(e) => handleModGroupChange(e.target.value)}>
              <option value={ALL_MODS_GROUP}>All modifications</option>
              {MOD_GROUPS.map((g) => (
                <option key={g.group} value={g.group}>{g.group}</option>
              ))}
            </select>
          </div>
          {modGroup !== ALL_MODS_GROUP && (
            <div className="field" style={{ marginTop: '0.7rem' }}>
              <label htmlFor="lookup-mod-item">Item</label>
              <select id="lookup-mod-item" value={modItem} onChange={(e) => setModItem(e.target.value)}>
                <option value="all">All in this group</option>
                {modGroupData?.subgroups.map((sg) => (
                  <optgroup key={sg.subcategory} label={sg.subcategory}>
                    {sg.mods.map((m) => (
                      <option key={m} value={m}>{MOD_LABELS[m]}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {category === 'bills' && (
        <div className="field" style={{ marginTop: '0.7rem' }}>
          <label htmlFor="lookup-bill-item">Item</label>
          <select id="lookup-bill-item" value={billType} onChange={(e) => setBillType(e.target.value)}>
            <option value="all">All bills</option>
            {Object.entries(BILL_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="field" style={{ marginTop: '0.9rem' }}>
        <label htmlFor="lookup-date-mode">Date range</label>
        <select id="lookup-date-mode" value={dateMode} onChange={(e) => setDateMode(e.target.value as 'range' | 'lastN')}>
          <option value="range">Between exact dates</option>
          <option value="lastN">Last N days</option>
        </select>
      </div>

      {dateMode === 'range' ? (
        <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap' }}>
          <div className="field" style={{ marginTop: '0.5rem', flex: 1, minWidth: '140px' }}>
            <label htmlFor="lookup-from">From</label>
            <input id="lookup-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="field" style={{ marginTop: '0.5rem', flex: 1, minWidth: '140px' }}>
            <label htmlFor="lookup-to">To</label>
            <input id="lookup-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
      ) : (
        <div className="field" style={{ marginTop: '0.5rem', maxWidth: '160px' }}>
          <label htmlFor="lookup-last-n">Last how many days?</label>
          <input id="lookup-last-n" type="number" min="1" value={lastNDays} onChange={(e) => setLastNDays(e.target.value)} />
        </div>
      )}

      <div className={styles.lookupResult}>
        <div className={styles.lookupResultTotal}>{formatCurrency(total, currency, rates)}</div>
        <div className={styles.lookupResultCount}>
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </div>
      </div>

      {entries.length > 0 && (
        <div className={styles.lookupEntries}>
          {entries.map((e, i) => (
            <div key={i} className={styles.lookupEntryRow}>
              <span className={styles.lookupEntryDate}>{fmtDate(e.date)}</span>
              <span className={styles.lookupEntryDesc}>{e.description}</span>
              <span className={styles.lookupEntryCost}>{formatCurrency(e.cost, currency, rates)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
