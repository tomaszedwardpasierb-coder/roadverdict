// Place at: src/app/tomasz/FunnelPanel.tsx
//
// The sign-up funnel (lib/analytics/funnel.ts), last 14 days: how many
// people reached each step, what share made it from one step to the
// next, and where each step's visitors came from - then the two shorter
// funnels after sign-up, Pro and shared reports. Anonymous counts only.
import { getFunnelDays, FUNNEL_SOURCES, type FunnelDay } from '@/lib/analytics/funnel';
import styles from './adminShell.module.css';

const STEPS: { key: string; label: string }[] = [
  { key: 'home', label: 'Home page (signed out)' },
  { key: 'login', label: 'Sign-in page' },
  { key: 'link_requested', label: 'Sign-in link emailed' },
  { key: 'signed_in', label: 'Link opened (signed in)' },
  { key: 'account_created', label: 'New account' },
  { key: 'first_vehicle', label: 'First vehicle added' },
  { key: 'vehicle_added', label: 'Any vehicle added' },
];

// After sign-up. What happens past checkout is read from Stripe (see
// ProPanel); buyers are the sign-up steps counted with source "report" -
// the line at the foot of every shared report.
const LATER: { group: string; steps: { key: string; label: string }[] }[] = [
  {
    group: 'Pro',
    steps: [
      { key: 'pro', label: 'Pro page viewed' },
      { key: 'checkout_started', label: 'Checkout started' },
    ],
  },
  {
    group: 'Sample-bike demo',
    steps: [
      { key: 'demo', label: 'Demo page viewed' },
      { key: 'demo_scanned', label: 'Read a receipt' },
      { key: 'demo_asked', label: 'Asked a question' },
      { key: 'link_requested__src_demo', label: 'Asked for a sign-in link from the demo' },
      { key: 'account_created__src_demo', label: 'Opened an account from the demo' },
    ],
  },
  {
    group: 'Shared reports',
    steps: [
      { key: 'report_shared', label: 'Report link shared' },
      { key: 'report', label: 'Shared report viewed' },
      { key: 'link_requested__src_report', label: 'Buyer asked for a sign-in link' },
      { key: 'account_created__src_report', label: 'Buyer opened an account' },
    ],
  },
];

function total(days: FunnelDay[], key: string): number {
  return days.reduce((sum, d) => sum + (d.counts[key] ?? 0), 0);
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '-';
}

export async function FunnelPanel() {
  let days: FunnelDay[];
  try {
    days = await getFunnelDays(14);
  } catch {
    return <p className={styles.warnNote}>The sign-up funnel couldn&apos;t be loaded.</p>;
  }

  const shown = STEPS.slice(0, 6);
  const sources = FUNNEL_SOURCES.filter((src) => STEPS.some((s) => total(days, `${s.key}__src_${src}`) > 0));

  return (
    <>
      <p className={styles.warnNote} style={{ marginBottom: '0.6rem' }}>
        Last 14 days, counted since this was added - anonymous totals, no cookies. A visitor who signs in on another
        device or browser still counts, but loses their source after the sign-in page. &quot;In-app&quot; = the browser
        inside Facebook, Instagram, TikTok or YouTube.
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Step</th>
            <th>People</th>
            <th>From the step before</th>
            <th>In-app browser</th>
            {sources.map((src) => (
              <th key={src}>{src}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STEPS.map((step, i) => {
            const n = total(days, step.key);
            const before = i > 0 && i < shown.length ? total(days, STEPS[i - 1].key) : null;
            return (
              <tr key={step.key}>
                <td>{step.label}</td>
                <td>{n}</td>
                <td>{before === null ? '' : pct(n, before)}</td>
                <td>{total(days, `${step.key}__inapp`) || ''}</td>
                {sources.map((src) => (
                  <td key={src}>{total(days, `${step.key}__src_${src}`) || ''}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <details style={{ marginTop: '0.6rem' }}>
        <summary>By day</summary>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Day</th>
              {shown.map((s) => (
                <th key={s.key}>{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day}>
                <td>{d.day}</td>
                {shown.map((s) => (
                  <td key={s.key}>{d.counts[s.key] ?? 0}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <table className={styles.table} style={{ marginTop: '1rem' }}>
        <thead>
          <tr>
            <th>After sign-up</th>
            <th>People</th>
            <th>From the step before</th>
          </tr>
        </thead>
        <tbody>
          {LATER.flatMap((group) => [
            <tr key={group.group}>
              <td colSpan={3}>
                <strong>{group.group}</strong>
              </td>
            </tr>,
            ...group.steps.map((step, i) => {
              const n = total(days, step.key);
              return (
                <tr key={step.key}>
                  <td>{step.label}</td>
                  <td>{n}</td>
                  <td>{i === 0 ? '' : pct(n, total(days, group.steps[i - 1].key))}</td>
                </tr>
              );
            }),
          ])}
        </tbody>
      </table>
    </>
  );
}
