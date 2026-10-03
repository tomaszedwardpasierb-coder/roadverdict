// Place at: src/app/demo/DemoExperience.tsx
//
// The sample-bike demo (/demo): a replica of the real dashboard, opened on
// its Reports page, for a made-up Yamaha MT-07 with a year of made-up
// history. It uses the dashboard's own layout styles and its real chart
// components, so it looks and behaves like the product. Only one thing is
// live - the pulsing "Scan a receipt with AI" button, which reads a receipt
// for real (api/demo/scan), adds it to the charts and offers a question to
// ask the logbook (api/demo/ask). Every other button opens a prompt to
// create a free account. The sample data lives in code
// (lib/demo/sampleBike.ts), so nothing a visitor does is saved or visible
// to anyone else, and the receipt they upload is read and discarded.
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import shell from '@/app/dashboard/DashboardShell.module.css';
import dash from '@/app/dashboard/dashboard.module.css';
import page from '@/app/dashboard/page.module.css';
import { Icon, type IconName } from '@/app/dashboard/Icon';
import { ChartFilterProvider } from '@/app/dashboard/ChartFilterContext';
import { ChartFilterBar } from '@/app/dashboard/ChartFilterBar';
import { TabSwitchProvider } from '@/app/dashboard/TabSwitchContext';
import { ChartPersistContext } from '@/app/dashboard/useChartTypePreference';
import { MpgChart } from '@/app/dashboard/MpgChart';
import { FuelCostChart } from '@/app/dashboard/FuelCostChart';
import { CategorySpendChart } from '@/app/dashboard/CategorySpendChart';
import { SAMPLE_BIKE, SAMPLE_ENTRIES, CATEGORY_LABELS, chartItems, fuelPoints, mpgSeries, type DemoCategory, type DemoEntry } from '@/lib/demo/sampleBike';
import styles from './demo.module.css';

const SIGN_UP_HREF = `/login?redirect=${encodeURIComponent('/dashboard?addVehicle=bike')}&src=demo`;

// The dashboard's navigation, as in DashboardShell.tsx - all of it
// read-only here except the groups opening and closing.
const NAV_GROUPS: { key: string; label: string; icon: IconName; open: boolean; items: { label: string; icon: IconName; active?: boolean }[] }[] = [
  {
    key: 'logbook',
    label: 'Logbook',
    icon: 'logbook',
    open: true,
    items: [
      { label: 'Service', icon: 'service' },
      { label: 'Fuel', icon: 'fuel' },
      { label: 'Parts & Accessories', icon: 'mods' },
      { label: 'Insurance, Tax, MOT & Finance', icon: 'bills' },
      { label: 'Labour', icon: 'labour' },
      { label: 'Fines', icon: 'fines' },
      { label: 'Tolls', icon: 'tolls' },
    ],
  },
  {
    key: 'insights',
    label: 'Insights',
    icon: 'insights',
    open: true,
    items: [
      { label: 'Reports', icon: 'reports', active: true },
      { label: 'The Story So Far', icon: 'story' },
      { label: 'The Vault', icon: 'vault' },
    ],
  },
  {
    key: 'selling',
    label: 'Selling',
    icon: 'selling',
    open: false,
    items: [
      { label: 'Shareable Links', icon: 'shareLinks' },
      { label: 'Transfer ownership', icon: 'transferOwnership' },
    ],
  },
  {
    key: 'buyingTools',
    label: 'Buying Tools',
    icon: 'buyingTools',
    open: false,
    items: [
      { label: 'Quote Checker', icon: 'quoteChecker' },
      { label: 'Cost calculator', icon: 'costCalculator' },
      { label: 'Buying a used bike', icon: 'buyingGuide' },
    ],
  },
];

function pounds(n: number, decimals = 2): string {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function dayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

type ScanItem = { category: DemoCategory; date: string; costGbp: number; description: string; litres: number | null; mileageOnReceipt: number | null; merchantName: string | null };
type Answer = { question: string; answer: string };

export function DemoExperience() {
  const [scanned, setScanned] = useState<DemoEntry[]>([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [scanError, setScanError] = useState('');
  const [askOpen, setAskOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState('');
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [locked, setLocked] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(Object.fromEntries(NAV_GROUPS.map((g) => [g.key, g.open])));
  const fileInput = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const entries = [...scanned, ...SAMPLE_ENTRIES];
  const mileage = Math.max(SAMPLE_BIKE.mileage, ...scanned.map((e) => e.mileage ?? 0));
  const series = mpgSeries(entries);
  const lock = (label: string) => setLocked(label);

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
        ...(item.mileageOnReceipt ? { mileage: item.mileageOnReceipt } : {}),
        scanned: true,
      }));
      setScanned((current) => [...items, ...current]);
      setScanOpen(false);
      // Let the charts react first, then offer the next step.
      timer.current = setTimeout(() => setAskOpen(true), 1600);
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

  const empty = (title: string, note: string) => (
    <>
      <div className={dash.chartCardTitle}>{title}</div>
      <p className={dash.emptyNote}>{note}</p>
    </>
  );
  const labour = chartItems(entries, 'labour');

  const bottomItem = (label: string, icon: IconName, active = false) => (
    <button
      key={label}
      type="button"
      onClick={() => lock(label)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.2rem',
        background: 'none',
        border: 'none',
        fontSize: '0.65rem',
        color: active ? 'var(--amber-ink)' : 'var(--ink-soft)',
      }}>
      <Icon name={icon} className={shell.navIcon} />
      {label}
    </button>
  );

  return (
    <TabSwitchProvider onSwitchTab={() => lock('Your logbook')}>
      <ChartPersistContext.Provider value={false}>
        <div className={shell.shell} data-dashboard-shell>
          <aside className={`${shell.sidebar} ${dash.sidebar}`}>
            <div className={shell.sidebarLogo}>
              <Link href="/">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-dark.png" alt="RoadVerdict" />
              </Link>
            </div>

            <nav className={shell.sidebarNav}>
              <button type="button" className={shell.sidebarNavItem} onClick={() => lock('The dashboard')}>
                <Icon name="dashboard" className={shell.navIcon} />
                <span>Dashboard</span>
              </button>
              {NAV_GROUPS.map((group) => (
                <div key={group.key} className={shell.sidebarNavGroup}>
                  <button
                    type="button"
                    className={shell.sidebarNavGroupHeader}
                    aria-expanded={openGroups[group.key]}
                    onClick={() => setOpenGroups((current) => ({ ...current, [group.key]: !current[group.key] }))}>
                    <Icon name={group.icon} className={shell.navIcon} />
                    <span>{group.label}</span>
                    <Icon name={openGroups[group.key] ? 'chevronDown' : 'chevronRight'} className={shell.navChevron} />
                  </button>
                  {openGroups[group.key] && (
                    <div className={shell.sidebarNavGroupItems}>
                      {group.items.map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          className={`${shell.sidebarNavItem} ${shell.sidebarNavItemIndented} ${item.active ? shell.sidebarNavItemActive : ''}`}
                          onClick={() => (item.active ? undefined : lock(item.label))}>
                          <Icon name={item.icon} className={shell.navIcon} />
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <button type="button" className={shell.sidebarNavItem} onClick={() => lock('Reminders')}>
                <Icon name="reminders" className={shell.navIcon} />
                <span>Reminders</span>
              </button>
              <button type="button" className={shell.sidebarNavItem} onClick={() => lock('Settings')}>
                <Icon name="security" className={shell.navIcon} />
                <span>Settings</span>
              </button>
            </nav>

            <div className={styles.sideVehicle}>
              <strong>{SAMPLE_BIKE.name}</strong>
              <span>{mileage.toLocaleString('en-GB')} mi · sample bike</span>
            </div>
            <div className={shell.sidebarUserFooter}>
              <div className={dash.sidebarUserAvatar}>SB</div>
              <div className={shell.sidebarUserEmail}>Sample rider</div>
            </div>
            <Link href={SIGN_UP_HREF} className={styles.sideCta}>
              Create a free account
            </Link>
            <div style={{ marginTop: '0.8rem', borderTop: '1px solid rgba(255, 255, 255, 0.12)', paddingTop: '0.6rem' }}>
              <Link href="/privacy" className={shell.sidebarNavItem} target="_blank" style={{ textDecoration: 'none' }}>
                <Icon name="privacy" className={shell.navIcon} />
                <span>Privacy</span>
              </Link>
            </div>
          </aside>

          <div className={shell.mobileTopBar}>
            <div className={dash.mobileTopBarBike}>
              <strong>{SAMPLE_BIKE.name}</strong>
              <span>2019 · {mileage.toLocaleString('en-GB')} mi</span>
            </div>
            <Link href={SIGN_UP_HREF} className={styles.topCta}>
              Free account
            </Link>
          </div>

          <div className={shell.content}>
            <div className={styles.sampleBar}>
              <span className={styles.chip}>Sample bike · made-up data</span>
              <span>
                Everything here is read-only except the scan button. <Link href={SIGN_UP_HREF}>Create a free account</Link> to use it on your own vehicle.
              </span>
            </div>

            <ChartFilterProvider>
              <div className={styles.headRow}>
                <h1 className={dash.heading}>
                  Reports<span className={dash.headingBikeTag}> {SAMPLE_BIKE.name} · sample</span>
                </h1>
                <div className={dash.headerMileagePill}>
                  <Icon name="currentMiles" size={15} />
                  {mileage.toLocaleString('en-GB')} mi
                </div>
              </div>
              <p className={dash.subtext}>Every chart in one place - see where the money&apos;s really going, and whether your bike&apos;s getting thirstier with age.</p>

              <div className={styles.scanRow}>
                <button type="button" className={styles.scanBtn} onClick={() => setScanOpen(true)}>
                  <span className={styles.scanRing} aria-hidden="true" />
                  <Icon name="camera" size={18} />
                  Scan a receipt with AI
                </button>
                <span className={styles.scanHint}>Try it – this is the live button. Watch the charts change.</span>
              </div>

              {scanned.length > 0 && (
                <div className={styles.result} role="status">
                  <strong>Read from your receipt and added to the logbook</strong>
                  <ul>
                    {scanned.map((e) => (
                      <li key={e.id}>
                        {dayLabel(e.date)} · {CATEGORY_LABELS[e.category]} · {e.description} · <strong>{pounds(e.cost)}</strong>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className={styles.linkButton} onClick={() => setAskOpen(true)}>
                    Ask your logbook a question
                  </button>
                </div>
              )}

              <ChartFilterBar />
              <div className={page.reportsGrid}>
                <div className={dash.chartCard}>
                  {series.length > 0 ? (
                    <MpgChart series={series} fuelEconomyUnit="mpg" distanceUnit="mi" initialChartType="line" currency="GBP" rates={null} excludedFuelEntries={[]} />
                  ) : (
                    empty('MPG over time', 'Log two consecutive full-tank fill-ups to see this.')
                  )}
                </div>
                <div className={dash.chartCard}>
                  <FuelCostChart points={fuelPoints(entries)} currency="GBP" rates={null} distanceUnit="mi" initialChartType="line" />
                </div>
                <div className={dash.chartCard}>
                  <CategorySpendChart chartId="servicing-spend" title="Servicing spend over time" items={chartItems(entries, 'service')} category="service" color="#1C1D20" currency="GBP" rates={null} distanceUnit="mi" initialChartType="bar" />
                </div>
                <div className={dash.chartCard}>
                  <CategorySpendChart chartId="mods-spend" title="Parts & Accessories spend over time" items={chartItems(entries, 'mods')} category="mods" color="#EE9A2E" currency="GBP" rates={null} distanceUnit="mi" initialChartType="bar" />
                </div>
                <div className={dash.chartCard}>
                  <CategorySpendChart chartId="bills-spend" title="Insurance, tax, MOT & finance spend over time" items={chartItems(entries, 'bills')} category="bills" color="#8A867D" currency="GBP" rates={null} distanceUnit="mi" supportsMileageView={false} initialChartType="bar" />
                </div>
                <div className={dash.chartCard}>
                  {labour.length > 0 ? (
                    <CategorySpendChart chartId="labour-spend" title="Labour spend over time" items={labour} category="labour" color="#3E6B99" currency="GBP" rates={null} distanceUnit="mi" initialChartType="bar" />
                  ) : (
                    empty('Labour spend over time', 'No labour logged yet.')
                  )}
                </div>
              </div>
            </ChartFilterProvider>

            <div className={shell.contentFooterNote}>
              RoadVerdict is guidance benchmarked against typical prices, not a professional inspection. <Link href="/privacy">Privacy</Link> · <Link href="/about">About us</Link> ·{' '}
              <a href="mailto:hello@roadverdict.co.uk">hello@roadverdict.co.uk</a>
            </div>
          </div>

          <nav data-mobile-bottom-nav className={shell.mobileBottomNav}>
            {bottomItem('Dashboard', 'dashboard')}
            {bottomItem('Logbook', 'logbook')}
            {bottomItem('Insights', 'insights', true)}
            {bottomItem('Selling', 'selling')}
            {bottomItem('More', 'buyingTools')}
          </nav>
        </div>

        {scanOpen && (
          <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="demo-scan-title" onClick={() => !reading && setScanOpen(false)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <h2 id="demo-scan-title" className={styles.modalTitle}>
                Scan a receipt with AI
              </h2>
              <p className={styles.cardText}>The AI reads the date, the cost and what each line was for, then adds it to the logbook and the charts.</p>
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
              <button type="button" className={styles.linkButton} onClick={() => setScanOpen(false)} disabled={reading}>
                Cancel
              </button>
            </div>
          </div>
        )}

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
              <p className={styles.cardText}>On the sample bike you can scan a receipt and ask questions. Create a free account and everything works on your own bike or car.</p>
              <div className={styles.actions}>
                <Link href={SIGN_UP_HREF} className="btn-primary" style={{ textDecoration: 'none' }}>
                  Create a free account
                </Link>
                <button type="button" className="btn-secondary" onClick={() => setLocked(null)}>
                  Keep looking around
                </button>
              </div>
              <p className={styles.fine}>No password – just your email. Free for one vehicle.</p>
            </div>
          </div>
        )}
      </ChartPersistContext.Provider>
    </TabSwitchProvider>
  );
}
