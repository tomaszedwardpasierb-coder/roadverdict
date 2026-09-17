// Place at: src/components/AssistantProposedShareLinkCard.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { VehicleSpinner } from './VehicleSpinner';
import styles from './AssistantProposedEntryCard.module.css';

export interface ProposedShareLink {
  category: 'shareLink';
  vehicleKind: 'bike' | 'car';
  duration: '1week' | '1month' | '6months';
  recipientEmail: string;
  askingPrice?: number;
}

const DURATION_OPTIONS: { value: ProposedShareLink['duration']; label: string }[] = [
  { value: '1week', label: '1 week' },
  { value: '1month', label: '1 month' },
  { value: '6months', label: '6 months' },
];

// Renders the AI assistant's draft for a new shareable report link -
// the recipient email always stays editable and required before
// confirming, since that's who actually gets access through it. "Create
// link" POSTs to the exact same endpoint the manual Export & Share
// section uses. This never creates anything on its own; only the
// person's own click does.
export function AssistantProposedShareLinkCard({ link }: { link: ProposedShareLink }) {
  const router = useRouter();
  const [recipientEmail, setRecipientEmail] = useState(link.recipientEmail);
  const [duration, setDuration] = useState(link.duration);
  const [askingPrice, setAskingPrice] = useState(link.askingPrice != null ? String(link.askingPrice) : '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleConfirm() {
    if (!recipientEmail.trim() || !recipientEmail.includes('@')) {
      setError('Enter the email address you’re sharing this link with.');
      return;
    }
    let parsedAskingPrice: number | undefined;
    if (askingPrice.trim()) {
      const parsed = Number(askingPrice);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError('Enter a valid asking price, or leave it blank.');
        return;
      }
      parsedAskingPrice = parsed;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(link.vehicleKind === 'car' ? '/api/cars/car-share-link' : '/api/tracker/share-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration, recipientEmail: recipientEmail.trim(), askingPrice: parsedAskingPrice }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? 'Could not create the link. Try again.');
        setSubmitting(false);
        return;
      }
      setShareUrl(data.url);
      setSubmitting(false);
      router.refresh();
    } catch {
      setError('Could not reach RoadVerdict. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (shareUrl) {
    return (
      <div className={styles.card}>
        <p className={styles.loggedNote}>✓ Link created</p>
        <div className={styles.row}>
          <input readOnly value={shareUrl} className={styles.field} style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }} />
          <button type="button" className={styles.secondaryBtn} onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <span className={styles.cardLabel}>New shareable report link</span>

      <div className={styles.field}>
        <label htmlFor="ai-sharelink-email">Sharing with (email address)</label>
        <input
          id="ai-sharelink-email"
          type="email"
          placeholder="buyer@example.com"
          value={recipientEmail}
          onChange={(e) => setRecipientEmail(e.target.value)}
          disabled={submitting}
        />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="ai-sharelink-duration">Valid for</label>
          <select id="ai-sharelink-duration" value={duration} onChange={(e) => setDuration(e.target.value as ProposedShareLink['duration'])} disabled={submitting}>
            {DURATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="ai-sharelink-price">Asking price (£, optional)</label>
          <input id="ai-sharelink-price" type="number" min="0" step="0.01" value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} disabled={submitting} />
        </div>
      </div>

      {error && <p className={styles.errorNote} role="alert">{error}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.confirmBtn} onClick={handleConfirm} disabled={submitting}>
          {submitting && <VehicleSpinner kind={link.vehicleKind} size={20} />}
          {submitting ? 'Creating…' : 'Create link'}
        </button>
      </div>
    </div>
  );
}
