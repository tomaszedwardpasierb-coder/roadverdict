// Place at: src/app/tomasz/ClearNotificationsForm.tsx
'use client';
import { useState } from 'react';
import styles from './adminShell.module.css';
import type { BroadcastSummary } from '@/lib/tracker/notification';

function fmtDate(d: string): string {
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface Props {
  broadcasts: BroadcastSummary[];
  allEmails: string[];
}

function keyFor(b: { title: string; body: string; createdAt: string }): string {
  return `${b.createdAt} ${b.title} ${b.body}`;
}

export function ClearNotificationsForm({ broadcasts, allEmails }: Props) {
  const [broadcastMode, setBroadcastMode] = useState<'all' | 'specific'>('all');
  const [selectedBroadcasts, setSelectedBroadcasts] = useState<Set<string>>(new Set());
  const [recipientMode, setRecipientMode] = useState<'all' | 'specific'>('all');
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearedCount, setClearedCount] = useState<number | null>(null);

  function toggleBroadcast(key: string) {
    setSelectedBroadcasts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleEmail(email: string) {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setClearedCount(null);

    if (broadcastMode === 'specific' && selectedBroadcasts.size === 0) {
      setError('Choose at least one notification to clear, or switch to "All notifications".');
      return;
    }
    if (recipientMode === 'specific' && selectedEmails.size === 0) {
      setError('Choose at least one user, or switch to "All users".');
      return;
    }

    const broadcastPayload =
      broadcastMode === 'all'
        ? ('all' as const)
        : broadcasts
            .filter((b) => selectedBroadcasts.has(keyFor(b)))
            .map((b) => ({ title: b.title, body: b.body, createdAt: b.createdAt }));
    const recipientPayload = recipientMode === 'all' ? ('all' as const) : Array.from(selectedEmails);

    const confirmMessage = `Clear ${
      broadcastMode === 'all' ? 'ALL notifications' : `${selectedBroadcasts.size} selected notification(s)`
    } for ${
      recipientMode === 'all' ? `all ${allEmails.length} user(s)` : `${selectedEmails.size} selected user(s)`
    }? This can't be undone.`;
    if (!confirm(confirmMessage)) return;

    setClearing(true);
    try {
      const res = await fetch('/api/tomasz/clear-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broadcasts: broadcastPayload, recipients: recipientPayload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not clear notifications.');
        return;
      }
      setClearedCount(data.deletedCount ?? 0);
      setSelectedBroadcasts(new Set());
      setSelectedEmails(new Set());
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>Clear notifications</div>
      <p className={styles.note} style={{ marginBottom: '0.6rem' }}>
        Permanently deletes notifications from recipients&apos; bells - not the same as marking read.
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '0.8rem', fontSize: '0.83rem' }}>
          <label style={{ display: 'block', marginBottom: '0.3rem' }}>
            <input type="radio" checked={broadcastMode === 'all'} onChange={() => setBroadcastMode('all')} /> All notifications ever sent
          </label>
          <label style={{ display: 'block' }}>
            <input type="radio" checked={broadcastMode === 'specific'} onChange={() => setBroadcastMode('specific')} /> Specific notifications
          </label>
        </div>

        {broadcastMode === 'specific' && (
          <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--admin-border)', borderRadius: '6px', padding: '0.5rem', marginBottom: '0.8rem' }}>
            {broadcasts.length === 0 ? (
              <p className={styles.warnNote}>No notifications sent yet.</p>
            ) : (
              broadcasts.map((b) => {
                const key = keyFor(b);
                return (
                  <label key={key} style={{ display: 'block', padding: '0.25rem 0', fontSize: '0.8rem' }}>
                    <input type="checkbox" checked={selectedBroadcasts.has(key)} onChange={() => toggleBroadcast(key)} />{' '}
                    <strong>{b.title}</strong> &mdash; {fmtDate(b.createdAt)} &middot; sent to {b.recipientCount}{' '}
                    user{b.recipientCount === 1 ? '' : 's'}
                  </label>
                );
              })
            )}
          </div>
        )}

        <div style={{ marginBottom: '0.8rem', fontSize: '0.83rem' }}>
          <label style={{ marginRight: '1rem' }}>
            <input type="radio" checked={recipientMode === 'all'} onChange={() => setRecipientMode('all')} /> All users
          </label>
          <label>
            <input type="radio" checked={recipientMode === 'specific'} onChange={() => setRecipientMode('specific')} /> Specific users
          </label>
        </div>

        {recipientMode === 'specific' && (
          <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--admin-border)', borderRadius: '6px', padding: '0.5rem', marginBottom: '0.8rem' }}>
            {allEmails.length === 0 ? (
              <p className={styles.warnNote}>No registered users found.</p>
            ) : (
              allEmails.map((email) => (
                <label key={email} style={{ display: 'block', padding: '0.25rem 0', fontSize: '0.82rem' }}>
                  <input type="checkbox" checked={selectedEmails.has(email)} onChange={() => toggleEmail(email)} /> {email}
                </label>
              ))
            )}
          </div>
        )}

        {error && <p className={styles.warnNote} style={{ color: 'var(--admin-danger)', marginBottom: '0.6rem' }}>{error}</p>}
        {clearedCount !== null && (
          <p className={styles.note} style={{ marginBottom: '0.6rem' }}>Cleared {clearedCount} notification{clearedCount === 1 ? '' : 's'}.</p>
        )}

        <button type="submit" disabled={clearing} className={`${styles.button} ${styles.buttonDanger}`}>
          {clearing ? 'Clearing…' : 'Clear notifications'}
        </button>
      </form>
    </div>
  );
}
