// Place at: src/app/tomasz/SendNotificationForm.tsx
'use client';

import { useState } from 'react';
import styles from './tomasz.module.css';

interface Props {
  allEmails: string[];
}

export function SendNotificationForm({ allEmails }: Props) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [linkTo, setLinkTo] = useState('');
  const [mode, setMode] = useState<'all' | 'specific'>('all');
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState<number | null>(null);

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
    setSentCount(null);

    const recipients = mode === 'all' ? 'all' : Array.from(selectedEmails);
    if (mode === 'specific' && selectedEmails.size === 0) {
      setError('Choose at least one recipient, or switch to "Everyone".');
      return;
    }

    // Reach is the whole point of this action - a confirmation naming
    // exactly who it goes to catches an accidental "Everyone" click
    // before it's actually irreversible, the same way deleting a bike
    // asks first elsewhere in this app.
    const confirmMessage =
      mode === 'all'
        ? `Send this to all ${allEmails.length} registered user(s)? This can't be undone.`
        : `Send this to ${selectedEmails.size} selected user(s)? This can't be undone.`;
    if (!confirm(confirmMessage)) return;

    setSending(true);
    try {
      const res = await fetch('/api/tomasz/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message, linkTo: linkTo.trim() || undefined, recipients }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not send. Try again.');
        return;
      }
      setSentCount(data.sentCount ?? 0);
      setTitle('');
      setMessage('');
      setLinkTo('');
      setSelectedEmails(new Set());
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.statusCard}>
      <div className={styles.statusTitle}>Send a notification</div>
      <p style={{ marginBottom: '0.6rem' }}>
        Appears in the notification bell for whoever it&apos;s sent to - not an email, only visible if they open
        the app.
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '0.6rem' }}>
          <label htmlFor="notif-title" style={{ display: 'block', marginBottom: '0.2rem' }}>Title</label>
          <input
            id="notif-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            style={{ width: '100%', maxWidth: '420px' }}
          />
        </div>

        <div style={{ marginBottom: '0.6rem' }}>
          <label htmlFor="notif-message" style={{ display: 'block', marginBottom: '0.2rem' }}>Message</label>
          <textarea
            id="notif-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            rows={3}
            style={{ width: '100%', maxWidth: '420px' }}
          />
        </div>

        <div style={{ marginBottom: '0.8rem' }}>
          <label htmlFor="notif-link" style={{ display: 'block', marginBottom: '0.2rem' }}>
            Link when clicked (optional)
          </label>
          <input
            id="notif-link"
            type="text"
            value={linkTo}
            onChange={(e) => setLinkTo(e.target.value)}
            placeholder="/dashboard"
            style={{ width: '100%', maxWidth: '420px' }}
          />
          <p className={styles.warn} style={{ marginTop: '0.2rem' }}>
            Must be a path on this site starting with a single /, e.g. /dashboard - anything else is silently
            dropped, same validation the sign-in redirect uses.
          </p>
        </div>

        <div style={{ marginBottom: '0.8rem' }}>
          <label style={{ marginRight: '1rem' }}>
            <input type="radio" checked={mode === 'all'} onChange={() => setMode('all')} /> Everyone ({allEmails.length}{' '}
            user{allEmails.length === 1 ? '' : 's'})
          </label>
          <label>
            <input type="radio" checked={mode === 'specific'} onChange={() => setMode('specific')} /> Specific users
          </label>
        </div>

        {mode === 'specific' && (
          <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.5rem', marginBottom: '0.8rem' }}>
            {allEmails.length === 0 ? (
              <p className={styles.warn}>No registered users found.</p>
            ) : (
              allEmails.map((email) => (
                <label key={email} style={{ display: 'block', padding: '0.2rem 0' }}>
                  <input type="checkbox" checked={selectedEmails.has(email)} onChange={() => toggleEmail(email)} /> {email}
                </label>
              ))
            )}
          </div>
        )}

        {error && <p className={styles.warn} style={{ color: 'var(--verdict-red)', marginBottom: '0.6rem' }}>{error}</p>}
        {sentCount !== null && (
          <p style={{ marginBottom: '0.6rem' }}>Sent to {sentCount} user{sentCount === 1 ? '' : 's'}.</p>
        )}

        <button type="submit" disabled={sending}>
          {sending ? 'Sending…' : 'Send notification'}
        </button>
      </form>
    </div>
  );
}
