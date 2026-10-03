// Place at: src/app/demo/DemoExperience.tsx
//
// The sample-bike demo (/demo): a made-up Yamaha MT-07 with a year of
// made-up history, where a visitor can do the two things RoadVerdict does
// best - read a receipt with AI, and ask the logbook a question - and watch
// the charts react. Everything else is shown but locked behind a free
// account. The sample data lives in code (lib/demo/sampleBike.ts), so
// nothing a visitor does is saved or visible to anyone else; the receipt
// they upload is read and discarded (api/demo/scan).
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  SAMPLE_BIKE,
  SAMPLE_ENTRIES,
  SAMPLE_REMINDERS,
  CATEGORY_LABELS,
  figuresFor,
  fuelEconomy,
  inWindow,
  monthlySpend,
  spendByCategory,
  type DemoCategory,
  type DemoEntry,
} from '@/lib/demo/sampleBike';
import { FuelEconomyLine, SpendByCategory, SpendByMonth } from './DemoCharts';
import styles from './demo.module.css';

const SIGN_UP_HREF = `/login?redirect=${encodeURIComponent('/dashboard?addVehicle=bike')}&src=demo`;
const LOCKED_ACTIONS = ['Log a fill-up', 'Set a reminder', 'Update the mileage', 'Share the history with a buyer'];

function pounds(n: number, decimals = 0): string {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function dayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

type ScanItem = { category: DemoCategory; date: string; costGbp: number; description: string; litres: number | null; mileageOnReceipt: number | null; merchantName: string | null };
type Answer = { question: string; answer: string };

export function DemoExperience() {
  const [scanned, setScanned] = useState<DemoEntry[]>([]);
  const [reading, setReading] = useState(false);
  const [scanError, setScanError] = useState('');
  const [askOpen, setAskOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState('');
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [locked, setLocked] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const entries = [...scanned, ...SAMPLE_ENTRIES];
  const figures = figuresFor(entries);
  const months = monthlySpend(entries);
  const categories = spendByCategory(entries.filter((e) => inWindow(e.date)));
  const economy = fuelEconomy(entries.filter((e) => inWindow(e.date)));
  const highlight = scanned.find((e) => inWindow(e.date))?.date.slice(0, 7) ?? null;
  const outside = scanned.filter((e) => !inWindow(e.date)).length;
  const logbook = [...entries].sort((a, b) => b.date.localeCompare(a.date) || (b.scanned ? 1 : 0) - (a.scanned ? 1 : 0));
  const shown = showAll ? logbook : logbook.slice(0, 8);

  async function readReceipt(file: File) {
    setReading(true);
    setScanError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/demo/scan', { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setScanError(data.error ?? 'Couldn’t read that receipt. Try the sample receipt.');
        return;
      }
      const items: DemoEntry[] = (data.items as ScanItem[]).map((item, i) => ({
        id: `scan-${Date.now()}-${i}`,
        date: item.date,
        category: item.category,
        description: [item.merchantName, item.description].filter(Boolean).join(' – ') || 'Scanned receipt',
        cost: item.costGbp,
        scanned: true,
      }));
      setScanned((current) => [...items, ...current]);
      // Let the new entry and the charts land first, then offer the next step.
      timer.current = setTimeout(() => setAskOpen(true), 1400);
    } catch {
      setScanError('Couldn’t reach the server. Check your connection and try again.');
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function useSampleReceipt() {
    setScanError('');
    try {
      const res = await fetch('/demo/sample-receipt.jpg');
      const blob = await res.blob();
      await readReceipt(new File([blob], 'sample-receipt.jpg', { type: 'image/jpeg' }));
    } catch {
      setScanError('Couldn’t load the sample receipt.');
    }
  }

  async function ask(text: string) {
    const q = text.trim();
    if (!q || asking) return;
    setAsking(true);
    setAskError('');
    try {
      const res = await fetch('/api/demo/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          scanned: scanned.map((e) => ({ category: e.category, date: e.date, cost: e.cost, description: e.description })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAskError(data.error ?? 'Couldn’t answer that just now.');
        return;
      }
      setAnswers((current) => [...current, { question: q, answer: data.answer }]);
      setQuestion('');
    } catch {
      setAskError('Couldn’t reach the server. Check your connection and try again.');
    } finally {
      setAsking(false);
    }
  }

  const suggestions = [
    'What have I spent on servicing this year?',
    'When is my next service due?',
    'What does this bike cost per mile?',
    ...(scanned.length > 0 ? ['What was on the receipt I just scanned?'] : []),
  ];

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <span className={styles.chip}>Sample bike · made-up data</span>
        <h1 className={styles.title}>{SAMPLE_BIKE.name}</h1>
        <p className={styles.sub}>
          {SAMPLE_BIKE.detail} · {SAMPLE_BIKE.mileage.toLocaleString('en-GB')} miles
        </p>
        <p className={styles.lead}>
          A year of this bike&apos;s costs, all in one place. Try the two things RoadVerdict does best: <strong>read a receipt</strong> and{' '}
          <strong>answer questions about your own history</strong>.
        </p>
      </header>

      <section className={styles.card} aria-labelledby="demo-scan-heading">
        <h2 id="demo-scan-heading" className={styles.cardTitle}>
          <span className={styles.step}>1</span> Scan a receipt
        </h2>
        <p className={styles.cardText}>The AI reads the date, the cost and what it was for, and adds it to the logbook below.</p>
        <div className={styles.actions}>
          <button type="button" className="btn-primary" onClick={useSampleReceipt} disabled={reading}>
            {reading ? 'Reading the receipt…' : 'Use the sample receipt'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => fileInput.current?.click()} disabled={reading}>
            Upload your own
          </button>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,application/pdf" hidden onChange={(e) => e.target.files?.[0] && readReceipt(e.target.files[0])} />
        </div>
        <p className={styles.fine}>Your receipt is read by AI and not saved. It isn&apos;t added to any account.</p>
        {scanError && (
          <p className="error-text" role="alert">
            {scanError}
          </p>
        )}
        {scanned.length > 0 && !scanError && (
          <div className={styles.result} role="status">
            <strong>Added to the logbook</strong>
            <ul>
              {scanned.map((e) => (
                <li key={e.id}>
                  {dayLabel(e.date)} · {CATEGORY_LABELS[e.category]} · {e.description} · <strong>{pounds(e.cost, 2)}</strong>
                </li>
              ))}
            </ul>
            {outside > 0 && <p className={styles.fine}>Dated outside the 12 months shown, so it&apos;s in the logbook but not on the monthly chart.</p>}
          </div>
        )}
      </section>

      <section className={styles.stats} aria-label="The last 12 months">
        <div className={styles.stat}>
          <span className={styles.statValue}>{pounds(figures.total)}</span>
          <span className={styles.statLabel}>spent in 12 months</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{figures.costPerMile !== null ? pounds(figures.costPerMile, 2) : '–'}</span>
          <span className={styles.statLabel}>per mile</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{figures.averageMpg !== null ? `${figures.averageMpg.toFixed(0)} mpg` : '–'}</span>
          <span className={styles.statLabel}>average fuel economy</span>
        </div>
      </section>

      <SpendByMonth data={months} highlight={highlight} />
      <SpendByCategory data={categories} />
      <FuelEconomyLine data={economy} />

      <section className={styles.card} aria-labelledby="demo-ask-heading">
        <h2 id="demo-ask-heading" className={styles.cardTitle}>
          <span className={styles.step}>2</span> Ask your logbook
        </h2>
        <p className={styles.cardText}>Questions are answered from this bike&apos;s own history.</p>
        <button type="button" className="btn-secondary" onClick={() => setAskOpen(true)}>
          Ask a question
        </button>
      </section>

      <section className={styles.card} aria-labelledby="demo-log-heading">
        <h2 id="demo-log-heading" className={styles.cardTitle}>
          Logbook
        </h2>
        <ul className={styles.entries}>
          {shown.map((e) => (
            <li key={e.id} className={styles.entry}>
              <span className={styles.entryMain}>
                <span className={styles.entryTitle}>{e.description}</span>
                <span className={styles.entryMeta}>
                  {dayLabel(e.date)} · {CATEGORY_LABELS[e.category]}
                  {e.scanned ? <span className={styles.scannedTag}>Scanned just now</span> : null}
                </span>
              </span>
              <span className={styles.entryCost}>{pounds(e.cost, 2)}</span>
            </li>
          ))}
        </ul>
        {logbook.length > 8 && (
          <button type="button" className={styles.linkButton} onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show fewer' : `Show all ${logbook.length} entries`}
          </button>
        )}
        <h3 className={styles.subTitle}>Coming up</h3>
        <ul className={styles.upcoming}>
          {SAMPLE_REMINDERS.map((r) => (
            <li key={r.name}>
              <strong>{r.name}</strong> – {r.due}
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.card} aria-labelledby="demo-more-heading">
        <h2 id="demo-more-heading" className={styles.cardTitle}>
          Want to do more?
        </h2>
        <p className={styles.cardText}>Everything else works the same way on your own vehicle, with a free account.</p>
        <div className={styles.locks}>
          {LOCKED_ACTIONS.map((label) => (
            <button key={label} type="button" className={styles.lock} onClick={() => setLocked(label)}>
              <span aria-hidden="true">🔒</span> {label}
            </button>
          ))}
        </div>
        <Link href={SIGN_UP_HREF} className="btn-primary" style={{ textDecoration: 'none', display: 'inline-block', marginTop: '1rem' }}>
          Create a free account
        </Link>
        <p className={styles.fine}>No password – just your email. Free for one vehicle.</p>
      </section>

      {askOpen && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="demo-ask-title" onClick={() => setAskOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 id="demo-ask-title" className={styles.modalTitle}>
              {scanned.length > 0 ? 'Now ask your logbook a question' : 'Ask your logbook a question'}
            </h2>
            <div className={styles.chips}>
              {suggestions.map((s) => (
                <button key={s} type="button" className={styles.suggestion} onClick={() => ask(s)} disabled={asking}>
                  {s}
                </button>
              ))}
            </div>
            <form
              className={styles.askForm}
              onSubmit={(e) => {
                e.preventDefault();
                void ask(question);
              }}>
              <label htmlFor="demo-question" className={styles.srOnly}>
                Your question
              </label>
              <input id="demo-question" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={200} placeholder="Or type your own…" autoComplete="off" />
              <button type="submit" className="btn-primary" disabled={asking || !question.trim()}>
                {asking ? 'Thinking…' : 'Ask'}
              </button>
            </form>
            {askError && (
              <p className="error-text" role="alert">
                {askError}
              </p>
            )}
            <div className={styles.answers} aria-live="polite">
              {answers.map((a, i) => (
                <div key={i} className={styles.qa}>
                  <p className={styles.q}>{a.question}</p>
                  <p className={styles.a}>{a.answer}</p>
                </div>
              ))}
            </div>
            {answers.length > 0 && (
              <p className={styles.modalCta}>
                That&apos;s answered from sample data. <Link href={SIGN_UP_HREF}>Ask about your own vehicle – free account</Link>
              </p>
            )}
            <button type="button" className={styles.linkButton} onClick={() => setAskOpen(false)}>
              Back to the sample bike
            </button>
          </div>
        </div>
      )}

      {locked && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="demo-lock-title" onClick={() => setLocked(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 id="demo-lock-title" className={styles.modalTitle}>
              {locked} is part of your free account
            </h2>
            <p className={styles.cardText}>On the sample bike you can read a receipt and ask questions. Create a free account and it all works on your own bike or car.</p>
            <div className={styles.actions}>
              <Link href={SIGN_UP_HREF} className="btn-primary" style={{ textDecoration: 'none' }}>
                Create a free account
              </Link>
              <button type="button" className="btn-secondary" onClick={() => setLocked(null)}>
                Keep looking around
              </button>
            </div>
            <p className={styles.fine}>No password – just your email.</p>
          </div>
        </div>
      )}
    </div>
  );
}
