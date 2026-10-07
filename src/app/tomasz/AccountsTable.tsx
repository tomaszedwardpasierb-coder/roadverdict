// Place at: src/app/tomasz/AccountsTable.tsx
'use client';
//
// /tomasz's All accounts: a colour per account for how recently it was
// used (see admin/accountActivity.ts), filters and sorting by that colour,
// tags such as "tester", and a bulk bar - tag, give Pro until a date, or
// copy the emails - for whichever rows are ticked. The per-account admin
// controls that were here before (block, Premium, vehicles, sessions,
// onboarding, delete) sit at the end of each row, unchanged.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AccountActivity, AccountStatus } from '@/lib/admin/accountActivity';
import { BlockAccountButton } from './BlockAccountButton';
import { GrantPremiumForm } from './GrantPremiumForm';
import { VehicleAllowanceForm } from './VehicleAllowanceForm';
import { ResetStoryCooldownButton } from './ResetStoryCooldownButton';
import { RevokeSessionsButton } from './RevokeSessionsButton';
import { EnableOnboardingButton } from './EnableOnboardingButton';
import { DeleteAccountButton } from './DeleteAccountButton';
import styles from './adminShell.module.css';

export interface AccountRow {
  email: string;
  createdAt: string;
  blocked: boolean;
  plan: { expiresAt: string } | null;
  vehicleAllowance: number | null;
  onboarding: boolean;
  tags: string[];
  activity: AccountActivity | null;
}

const STATUS: Record<AccountStatus, { label: string; colour: string; rank: number }> = {
  active: { label: 'Active', colour: '#21815A', rank: 0 },
  cooling: { label: 'Cooling', colour: '#D99A1E', rank: 1 },
  inactive: { label: 'Inactive', colour: '#C1483A', rank: 2 },
  'never-started': { label: 'Never started', colour: '#A7A49C', rank: 3 },
};
const TAG_COLOUR: Record<string, string> = { tester: '#6B4FBB', friend: '#2F7D8C', press: '#8A6100' };

type Filter = 'all' | AccountStatus | 'tester';
type Sort = 'status' | 'last-seen' | 'created' | 'entries';

function ago(iso: string, now: number): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <span aria-label={`Active on ${values.filter((v) => v > 0).length} of the last 30 days`} style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 1, height: 18 }}>
      {values.map((v, i) => (
        <span key={i} style={{ width: 3, height: v ? Math.max(3, Math.round((v / max) * 18)) : 1, background: v ? '#21815A' : 'var(--admin-border-strong)' }} />
      ))}
    </span>
  );
}

export function AccountsTable({ rows, defaultSince }: { rows: AccountRow[]; defaultSince: string }) {
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('status');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [proUntil, setProUntil] = useState('2026-11-30');
  const [since, setSince] = useState(defaultSince);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, active: 0, cooling: 0, inactive: 0, 'never-started': 0, tester: 0 };
    for (const r of rows) {
      if (r.activity) c[r.activity.status]++;
      if (r.tags.includes('tester')) c.tester++;
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (q && !r.email.toLowerCase().includes(q)) return false;
      if (filter === 'all') return true;
      if (filter === 'tester') return r.tags.includes('tester');
      return r.activity?.status === filter;
    });
    const lastActivity = (r: AccountRow) => r.activity?.lastActivityAt ?? r.createdAt;
    return [...list].sort((a, b) => {
      if (sort === 'created') return b.createdAt.localeCompare(a.createdAt);
      if (sort === 'entries') return (b.activity?.entries14 ?? 0) - (a.activity?.entries14 ?? 0) || lastActivity(b).localeCompare(lastActivity(a));
      if (sort === 'last-seen') return lastActivity(b).localeCompare(lastActivity(a));
      const rank = (r: AccountRow) => (r.activity ? STATUS[r.activity.status].rank : 9);
      return rank(a) - rank(b) || lastActivity(b).localeCompare(lastActivity(a));
    });
  }, [rows, filter, sort, search]);

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.email));

  function toggle(email: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of visible) {
        if (allVisibleSelected) next.delete(r.email);
        else next.add(r.email);
      }
      return next;
    });
  }

  function selectAppSignupsSince() {
    const from = new Date(since).getTime();
    setSelected(new Set(rows.filter((r) => new Date(r.createdAt).getTime() >= from && r.activity?.usesApp).map((r) => r.email)));
  }

  async function post(path: string, body: object, describe: (data: Record<string, number>) => string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      setMessage(res.ok ? describe(data) : data.error ?? 'That didn’t work.');
      if (res.ok) router.refresh();
    } catch {
      setMessage('Could not reach the server.');
    }
    setBusy(false);
  }

  const emails = [...selected];

  return (
    <div>
      <div className={styles.pillRow} style={{ flexWrap: 'wrap' }}>
        {(['all', 'active', 'cooling', 'inactive', 'never-started', 'tester'] as Filter[]).map((f) => (
          <button key={f} type="button" className={`${styles.pill} ${filter === f ? styles.pillActive : ''}`} onClick={() => setFilter(f)} aria-pressed={filter === f}>
            {f !== 'all' && f !== 'tester' ? <span aria-hidden="true" style={{ color: STATUS[f].colour }}>● </span> : null}
            {f === 'all' ? 'All' : f === 'tester' ? 'Testers' : STATUS[f].label} ({counts[f]})
          </button>
        ))}
      </div>
      <p className={styles.note} style={{ marginTop: '-0.5rem' }}>
        Active: used in the last 7 days · Cooling: 8–30 days · Inactive: longer · Never started: no vehicle added. &quot;Last seen&quot; is recorded from 7 Oct 2026;
        before that, the latest sign-in or entry is used.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', margin: '0.6rem 0' }}>
        <input className={styles.input} style={{ maxWidth: 220 }} placeholder="Search email" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search email" />
        <label className={styles.note}>
          Sort{' '}
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="status">Colour (active first)</option>
            <option value="last-seen">Last seen</option>
            <option value="entries">Most entries (14 days)</option>
            <option value="created">Newest account</option>
          </select>
        </label>
        <span className={styles.note}>
          Select app sign-ups since{' '}
          <input type="date" value={since} onChange={(e) => setSince(e.target.value)} aria-label="App sign-ups since" />{' '}
          <button type="button" className={`${styles.button} ${styles.buttonSmall} ${styles.buttonSecondary}`} onClick={selectAppSignupsSince}>
            Select
          </button>
        </span>
      </div>

      {selected.size > 0 ? (
        <div role="region" aria-label="Bulk actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', padding: '0.5rem 0.7rem', margin: '0.4rem 0', background: 'var(--admin-accent-light)', borderRadius: 6 }}>
          <strong style={{ fontSize: '0.8rem' }}>{selected.size} selected</strong>
          <button type="button" disabled={busy} className={`${styles.button} ${styles.buttonSmall}`} onClick={() => post('/api/tomasz/accounts/tags', { emails, tag: 'tester', on: true }, (d) => `Tagged ${d.updated} as tester.`)}>
            Tag as tester
          </button>
          <button type="button" disabled={busy} className={`${styles.button} ${styles.buttonSmall} ${styles.buttonSecondary}`} onClick={() => post('/api/tomasz/accounts/tags', { emails, tag: 'tester', on: false }, (d) => `Removed the tester tag from ${d.updated}.`)}>
            Remove tester tag
          </button>
          <span>
            <input type="date" value={proUntil} onChange={(e) => setProUntil(e.target.value)} aria-label="Pro until" />{' '}
            <button
              type="button"
              disabled={busy || !proUntil}
              className={`${styles.button} ${styles.buttonSmall}`}
              onClick={() =>
                post('/api/tomasz/accounts/grant-premium-bulk', { emails, expiresAt: new Date(`${proUntil}T23:59:59Z`).toISOString() }, (d) =>
                  `Pro given to ${d.granted}. Skipped: ${d.paying} paying, ${d['already-longer']} already longer${d.failed ? `, ${d.failed} failed` : ''}.`
                )
              }>
              Give Pro until
            </button>
          </span>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonSmall} ${styles.buttonSecondary}`}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(emails.join('; '));
                setMessage(`Copied ${emails.length} email${emails.length === 1 ? '' : 's'}. For testers and one-to-one emails only – not marketing until there's an unsubscribe.`);
              } catch {
                setMessage('Couldn’t copy – your browser blocked the clipboard.');
              }
            }}>
            Copy emails
          </button>
          <button type="button" className={`${styles.button} ${styles.buttonSmall} ${styles.buttonSecondary}`} onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      ) : null}
      {message ? (
        <p className={styles.note} role="status">
          {message}
        </p>
      ) : null}

      <div style={{ overflowX: 'auto' }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Select all shown" />
              </th>
              <th>Email</th>
              <th>Activity</th>
              <th>Last seen</th>
              <th>Active days (14)</th>
              <th>Entries (14)</th>
              <th>Last 30 days</th>
              <th>Created</th>
              <th>Status</th>
              <th>Premium</th>
              <th>Vehicles</th>
              <th>Story cooldown</th>
              <th>Sessions</th>
              <th>Onboarding</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const a = r.activity;
              const s = a ? STATUS[a.status] : null;
              return (
                <tr key={r.email}>
                  <td>
                    <input type="checkbox" checked={selected.has(r.email)} onChange={() => toggle(r.email)} aria-label={`Select ${r.email}`} />
                  </td>
                  <td>
                    {r.email}
                    {r.tags.map((t) => (
                      <span key={t} style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 999, fontSize: '0.68rem', color: '#fff', background: TAG_COLOUR[t] ?? '#605e5c' }}>
                        {t}
                      </span>
                    ))}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {s ? (
                      <>
                        <span aria-hidden="true" style={{ color: s.colour }}>●</span> {s.label}
                      </>
                    ) : (
                      '–'
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {a ? ago(a.lastActivityAt, now) : '–'}
                    {a?.lastClient ? <span className={styles.note}> · {a.lastClient}</span> : null}
                  </td>
                  <td>{a?.activeDays14 ?? '–'}</td>
                  <td>{a?.entries14 ?? '–'}</td>
                  <td>{a ? <Spark values={a.spark30} /> : '–'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(r.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td>
                    {r.blocked ? <span style={{ color: 'var(--admin-danger)' }}>Blocked</span> : 'OK'} <BlockAccountButton email={r.email} blocked={r.blocked} />
                  </td>
                  <td><GrantPremiumForm email={r.email} plan={r.plan} /></td>
                  <td>
                    {a ? <span className={styles.note}>{a.vehicles} · </span> : null}
                    <VehicleAllowanceForm email={r.email} allowance={r.vehicleAllowance} />
                  </td>
                  <td><ResetStoryCooldownButton email={r.email} /></td>
                  <td><RevokeSessionsButton email={r.email} /></td>
                  <td><EnableOnboardingButton email={r.email} enabled={r.onboarding} /></td>
                  <td><DeleteAccountButton email={r.email} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
