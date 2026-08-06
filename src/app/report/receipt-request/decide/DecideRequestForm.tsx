// Place at: src/app/report/receipt-request/decide/DecideRequestForm.tsx
'use client';

import { useState } from 'react';
import type { ReceiptRequestItem } from '@/lib/tracker/receiptRequest';
import styles from '../../[token]/report.module.css';

type ItemDecision = 'approved' | 'declined' | 'pending';

function attachmentUrl(token: string, blobName: string): string {
  return `/api/report/receipt-request/attachment/${token}/${encodeURIComponent(blobName)}`;
}

function ItemPreview({ token, item }: { token: string; item: ReceiptRequestItem }) {
  if (!item.attachment) {
    return <span className={styles.noReceipt} title="This request was made before previews were added">No preview</span>;
  }
  const isImage = item.attachment.fileType === 'image/jpeg' || item.attachment.fileType === 'image/png';
  const url = attachmentUrl(token, item.attachment.blobName);
  return (
    <a href={url} target="_blank" rel="noopener" className={styles.receiptLink} title="View the full receipt">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className={styles.receiptThumb} />
      ) : (
        <span className={styles.receiptThumbPdf}>PDF</span>
      )}
      <span className={styles.receiptLabel}>View receipt</span>
    </a>
  );
}

export function DecideRequestForm({
  token,
  items,
  buyerMessage,
  preselectAll,
}: {
  token: string;
  items: ReceiptRequestItem[];
  buyerMessage?: string;
  preselectAll: 'approve' | 'decline' | null;
}) {
  const [decisions, setDecisions] = useState<Record<string, ItemDecision>>(() =>
    Object.fromEntries(items.map((i) => [i.entryId, preselectAll === 'approve' ? 'approved' : preselectAll === 'decline' ? 'declined' : i.status]))
  );
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitAll(decision: 'approved' | 'declined', entryIds: string[] | 'all') {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/report/receipt-request/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, entryIds, decision }),
      });
      if (res.ok) setDone(true);
      else setError('Could not save your decision. Please try again.');
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return <p className={styles.subtext}>Done - your decision has been saved. The person who requested this can now check the report link again.</p>;
  }

  if (preselectAll) {
    const verb = preselectAll === 'approve' ? 'approve' : 'decline';
    return (
      <div className={styles.gateBlock} style={{ margin: '2rem 0' }}>
        <p>
          You&apos;re about to <strong>{verb}</strong> sharing {items.length} receipt{items.length === 1 ? '' : 's'}:
        </p>
        <ul className={styles.questionsList} style={{ textAlign: 'left' }}>
          {items.map((i) => (
            <li key={i.entryId} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
              <ItemPreview token={token} item={i} />
              <span>{i.description}</span>
            </li>
          ))}
        </ul>
        {buyerMessage && <p className={styles.subtext}>Their note: &quot;{buyerMessage}&quot;</p>}
        {error && <p className="error-text" role="alert">{error}</p>}
        <button
          type="button"
          className="submit-button"
          disabled={submitting}
          onClick={() => submitAll(preselectAll === 'approve' ? 'approved' : 'declined', 'all')}
        >
          {submitting ? 'Saving…' : `Confirm - ${verb} all`}
        </button>
        <p className={styles.previewNote ?? styles.subtext} style={{ marginTop: '0.6rem' }}>
          Prefer to choose individually instead? <a href={`/report/receipt-request/decide?token=${token}`}>Review each one</a>.
        </p>
      </div>
    );
  }

  const [reasons, setReasons] = useState<Record<string, string>>({});

  async function handleIndividualSubmit() {
    const approvedIds = Object.entries(decisions).filter(([, v]) => v === 'approved').map(([id]) => id);
    const declinedIds = Object.entries(decisions).filter(([, v]) => v === 'declined').map(([id]) => id);
    setSubmitting(true);
    setError(null);
    try {
      if (approvedIds.length > 0) {
        await fetch('/api/report/receipt-request/decide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, entryIds: approvedIds, decision: 'approved' }),
        });
      }
      for (const id of declinedIds) {
        await fetch('/api/report/receipt-request/decide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, entryIds: [id], decision: 'declined', reason: reasons[id] }),
        });
      }
      setDone(true);
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {buyerMessage && <p className={styles.subtext}>Their note: &quot;{buyerMessage}&quot;</p>}
      {items.map((item) => (
        <div key={item.entryId} className={styles.upcomingBlock} style={{ marginBottom: '0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
            <ItemPreview token={token} item={item} />
            <p style={{ margin: 0 }}>{item.description}</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            {(['approved', 'declined', 'pending'] as const).map((option) => (
              <label key={option} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem' }}>
                <input
                  type="radio"
                  name={item.entryId}
                  checked={decisions[item.entryId] === option}
                  onChange={() => setDecisions((prev) => ({ ...prev, [item.entryId]: option }))}
                />
                {option === 'approved' ? 'Share' : option === 'declined' ? "Don't share" : 'Not yet'}
              </label>
            ))}
          </div>
          {decisions[item.entryId] === 'declined' && (
            <input
              type="text"
              placeholder="Reason (optional) - shown to the buyer instead of the default message"
              value={reasons[item.entryId] ?? ''}
              onChange={(e) => setReasons((prev) => ({ ...prev, [item.entryId]: e.target.value }))}
              style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.85rem' }}
            />
          )}
        </div>
      ))}
      {error && <p className="error-text" role="alert">{error}</p>}
      <button type="button" className="submit-button" disabled={submitting} onClick={handleIndividualSubmit}>
        {submitting ? 'Saving…' : 'Save decisions'}
      </button>
    </div>
  );
}
