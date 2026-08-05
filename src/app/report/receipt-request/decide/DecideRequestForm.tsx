// Place at: src/app/report/receipt-request/decide/DecideRequestForm.tsx
'use client';

import { useState } from 'react';
import type { ReceiptRequestItem } from '@/lib/tracker/receiptRequest';
import styles from '../../[token]/report.module.css';

type ItemDecision = 'approved' | 'declined' | 'pending';

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
          {items.map((i) => <li key={i.entryId}>{i.description}</li>)}
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
      if (declinedIds.length > 0) {
        await fetch('/api/report/receipt-request/decide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, entryIds: declinedIds, decision: 'declined' }),
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
          <p style={{ margin: '0 0 0.5rem' }}>{item.description}</p>
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
        </div>
      ))}
      {error && <p className="error-text" role="alert">{error}</p>}
      <button type="button" className="submit-button" disabled={submitting} onClick={handleIndividualSubmit}>
        {submitting ? 'Saving…' : 'Save decisions'}
      </button>
    </div>
  );
}
