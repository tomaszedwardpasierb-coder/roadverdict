// Place at: src/app/dashboard/ExportShareSection.tsx
'use client';

import { useState } from 'react';
import styles from './dashboard.module.css';

type ShareLinkDuration = '1week' | '1month' | '6months';

const DURATION_OPTIONS: { value: ShareLinkDuration; label: string }[] = [
  { value: '1week', label: '1 week' },
  { value: '1month', label: '1 month' },
  { value: '6months', label: '6 months' },
];

// Used in two places, deliberately the same component rather than two
// copies: the Dashboard tab (for a quick export or a link while you're
// already there) and the Shareable Links tab (where creating and
// managing links belong together). A copy or logic fix here only ever
// needs making once.
export function ExportShareSection() {
  const [duration, setDuration] = useState<ShareLinkDuration>('1month');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [emailTo, setEmailTo] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);

  async function handleGetLink() {
    if (!recipientEmail.trim() || !recipientEmail.includes('@')) {
      setCreateError('Please enter the email address you\u2019re sharing this link with.');
      return;
    }
    setCreateError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/tracker/share-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration, recipientEmail: recipientEmail.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setShareUrl(data.url);
        setExpiresAt(data.expiresAt ?? null);
        // Pre-fill the optional "send by email" step with the same
        // address, it's already known, so there's no reason to make
        // the owner type it twice.
        setEmailTo(recipientEmail.trim());
      } else {
        setCreateError(data.error ?? 'Could not create the link. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!shareUrl || !emailTo.trim()) return;
    const token = shareUrl.split('/report/')[1];
    setSendingEmail(true);
    setEmailStatus(null);
    try {
      const res = await fetch(`/api/tracker/share-link/${token}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toEmail: emailTo.trim() }),
      });
      const data = await res.json();
      setEmailStatus(res.ok ? `Sent to ${emailTo.trim()}.` : data.error ?? 'Could not send the email.');
      if (res.ok) setEmailTo('');
    } catch {
      setEmailStatus('Could not reach the server.');
    } finally {
      setSendingEmail(false);
    }
  }

  const expiresAtLabel = expiresAt
    ? new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <div className={styles.chartCard} style={{ marginBottom: '1.6rem' }}>
      <div className={styles.chartCardTitle}>Get a shareable report link</div>
      <p className={styles.subtext} style={{ marginBottom: '0.9rem' }}>
        Thinking of selling? This is how you prove it. Generate a link that shows a buyer exactly how this bike&apos;s
        been looked after, dates, costs, a real history, not just your word for it. Your personal details stay
        yours, receipts and invoices only appear if you specifically approve sharing them when someone asks.
      </p>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <a href="/api/tracker/export/csv" className="submit-button" style={{ textDecoration: 'none' }}>
          Download CSV
        </a>
      </div>

      {!shareUrl ? (
        <div style={{ marginTop: '1rem' }}>
          <div className="field" style={{ marginTop: 0, maxWidth: '320px' }}>
            <label htmlFor="share-recipient-email">Sharing with (email address)</label>
            <input
              id="share-recipient-email"
              type="email"
              placeholder="buyer@example.com"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              required
              style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '4px' }}
            />
          </div>
          <p className="field-note" style={{ marginTop: '0.4rem' }}>
            Required, this is who the link identifies if they ask you for a receipt through it.
          </p>
          <div className="field" style={{ marginTop: '0.8rem', maxWidth: '220px' }}>
            <label htmlFor="share-duration">Link stays valid for</label>
            <select id="share-duration" value={duration} onChange={(e) => setDuration(e.target.value as ShareLinkDuration)}>
              {DURATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <p className="field-note" style={{ marginTop: '0.5rem' }}>
            After this, the link stops working and is permanently deleted, it can be extended any time before then
            from the Shareable Links tab.
          </p>
          {createError && <p className="error-text" role="alert">{createError}</p>}
          <button type="button" className="submit-button" onClick={handleGetLink} disabled={loading} style={{ marginTop: '0.7rem' }}>
            {loading ? 'Generating…' : 'Get shareable report link'}
          </button>
        </div>
      ) : (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              readOnly
              value={shareUrl}
              style={{
                flex: 1,
                minWidth: '200px',
                padding: '0.5rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                border: '1px solid var(--border)',
                borderRadius: '4px',
              }}
            />
            <button type="button" className={styles.iconBtn} onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          {expiresAtLabel && (
            <p className="field-note" style={{ marginTop: '0.5rem' }}>
              Valid until {expiresAtLabel}, then permanently deleted. Manage this and any other links from the
              Shareable Links tab.
            </p>
          )}
          <form onSubmit={handleSendEmail} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem', flexWrap: 'wrap' }}>
            <input
              type="email"
              placeholder="Send to an email address"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              style={{ flex: 1, minWidth: '200px', padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '4px' }}
              required
            />
            <button type="submit" className={styles.iconBtn} disabled={sendingEmail}>
              {sendingEmail ? 'Sending…' : 'Send by email'}
            </button>
          </form>
          {emailStatus && <p className="field-note" style={{ marginTop: '0.4rem' }}>{emailStatus}</p>}
        </div>
      )}
    </div>
  );
}
