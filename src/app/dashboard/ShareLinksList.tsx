// Place at: src/app/dashboard/ShareLinksList.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ShareLinkDoc } from '@/lib/tracker/shareLink';
import styles from './dashboard.module.css';

type Duration = '1week' | '1month' | '6months';

const DURATION_OPTIONS: { value: Duration; label: string }[] = [
  { value: '1week', label: '1 week' },
  { value: '1month', label: '1 month' },
  { value: '6months', label: '6 months' },
];

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface Props {
  links: ShareLinkDoc[];
  bikeNames: Record<string, string>;
  appUrl: string;
}

export function ShareLinksList({ links, bikeNames, appUrl }: Props) {
  const router = useRouter();
  const [busyToken, setBusyToken] = useState<string | null>(null);
  const [extendingToken, setExtendingToken] = useState<string | null>(null);
  const [extendDuration, setExtendDuration] = useState<Duration>('1month');
  const [editingPriceToken, setEditingPriceToken] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState('');

  async function handleDelete(token: string) {
    if (!confirm('Delete this link? It will stop working immediately, remove any pending receipt requests made through it, and cannot be undone.')) return;
    setBusyToken(token);
    try {
      const res = await fetch(`/api/tracker/share-link/${token}`, { method: 'DELETE' });
      if (res.ok) router.refresh();
    } finally {
      setBusyToken(null);
    }
  }

  async function handleExtend(token: string) {
    setBusyToken(token);
    try {
      const res = await fetch(`/api/tracker/share-link/${token}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: extendDuration }),
      });
      if (res.ok) {
        setExtendingToken(null);
        router.refresh();
      }
    } finally {
      setBusyToken(null);
    }
  }

  function startEditingPrice(link: ShareLinkDoc) {
    setPriceInput(link.askingPrice != null ? String(link.askingPrice) : '');
    setEditingPriceToken(link.id);
  }

  async function handleUpdatePrice(token: string) {
    const trimmed = priceInput.trim();
    let parsed: number | null = null;
    if (trimmed) {
      const num = Number(trimmed);
      if (!Number.isFinite(num) || num <= 0) {
        return;
      }
      parsed = num;
    }
    setBusyToken(token);
    try {
      const res = await fetch(`/api/tracker/share-link/${token}/asking-price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ askingPrice: parsed }),
      });
      if (res.ok) {
        setEditingPriceToken(null);
        router.refresh();
      }
    } finally {
      setBusyToken(null);
    }
  }

  if (links.length === 0) {
    return <p className="field-note">No shareable links generated yet - create one from the Dashboard&apos;s Export &amp; share section.</p>;
  }

  return (
    <div>
      {links.map((link) => {
        const expired = link.expiresAt ? new Date(link.expiresAt) < new Date() : false;
        const url = `${appUrl}/report/${link.id}`;
        return (
          <div key={link.id} className={styles.jobCard} style={{ marginBottom: '0.8rem' }}>
            <div className={styles.jobCardTop}>
              <span className={styles.jobCardJob}>{bikeNames[link.bikeId] ?? 'Unknown bike'}</span>
              {expired && <span className={styles.tagHigh}>Expired</span>}
            </div>
            {link.recipientEmail && (
              <div className={styles.jobCardMeta}>Shared with {link.recipientEmail}</div>
            )}
            {link.askingPrice != null && (
              <div className={styles.jobCardMeta}>Asking price: £{link.askingPrice.toLocaleString()}</div>
            )}
            <div className={styles.jobCardMeta} style={{ wordBreak: 'break-all' }}>{url}</div>
            <div className={styles.jobCardMeta}>
              Created {fmtDate(link.createdAt)} ·{' '}
              {link.expiresAt ? `${expired ? 'Expired' : 'Valid until'} ${fmtDate(link.expiresAt)}` : 'Never expires'}
            </div>

            {extendingToken === link.id ? (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={extendDuration} onChange={(e) => setExtendDuration(e.target.value as Duration)}>
                  {DURATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <button type="button" className={styles.iconBtn} onClick={() => handleExtend(link.id)} disabled={busyToken === link.id}>
                  {busyToken === link.id ? 'Saving…' : 'Confirm'}
                </button>
                <button type="button" className={styles.iconBtn} onClick={() => setExtendingToken(null)}>Cancel</button>
              </div>
            ) : editingPriceToken === link.id ? (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="number"
                  inputMode="decimal"
                  min="1"
                  max="200000"
                  placeholder="e.g. 3200"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  style={{ width: '120px', padding: '0.4rem', border: '1px solid var(--border)', borderRadius: '4px' }}
                />
                <button type="button" className={styles.iconBtn} onClick={() => handleUpdatePrice(link.id)} disabled={busyToken === link.id}>
                  {busyToken === link.id ? 'Saving…' : 'Confirm'}
                </button>
                <button type="button" className={styles.iconBtn} onClick={() => setEditingPriceToken(null)}>Cancel</button>
              </div>
            ) : (
              <div className={styles.cardActions}>
                <button type="button" className={styles.iconBtn} onClick={() => { navigator.clipboard.writeText(url); }}>
                  Copy link
                </button>
                <button type="button" className={styles.iconBtn} onClick={() => setExtendingToken(link.id)} disabled={busyToken === link.id}>
                  Extend
                </button>
                <button type="button" className={styles.iconBtn} onClick={() => startEditingPrice(link)} disabled={busyToken === link.id}>
                  {link.askingPrice != null ? 'Edit price' : 'Add price'}
                </button>
                <button type="button" className={styles.iconBtn} onClick={() => handleDelete(link.id)} disabled={busyToken === link.id}>
                  {busyToken === link.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
