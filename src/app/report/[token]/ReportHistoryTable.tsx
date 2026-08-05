// Place at: src/app/report/[token]/ReportHistoryTable.tsx
'use client';

import { useState } from 'react';
import { isBackdated, backdateNotice } from '@/lib/tracker/backdateCheck';
import { isBeforeProduction } from '@/lib/tracker/productionYearCheck';
import type { ReportRow } from '@/lib/tracker/sellerReportData';
import type { BikeDoc } from '@/lib/tracker/bike';
import styles from './report.module.css';

function fmtMoney(n: number): string {
  return `£${n.toFixed(2)}`;
}
function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ReportHistoryTable({
  rows,
  total,
  bike,
  token,
  backdatedCount,
  realTimeCount,
  receiptCount,
  approvedEntryIds,
}: {
  rows: ReportRow[];
  total: number;
  bike: BikeDoc;
  token: string;
  backdatedCount: number;
  realTimeCount: number;
  receiptCount: number;
  approvedEntryIds: string[];
}) {
  const approved = new Set(approvedEntryIds);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [justRequested, setJustRequested] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerMessage, setBuyerMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/report/${token}/request-receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryIds: [...selected],
          buyerEmail: buyerEmail || undefined,
          buyerMessage: buyerMessage || undefined,
        }),
      });
      if (res.ok) {
        setJustRequested((prev) => new Set([...prev, ...selected]));
        setSelected(new Set());
        setShowForm(false);
        setDone(true);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? 'Could not send the request. Please try again.');
      }
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (rows.length === 0) {
    return <p>No service, modification, or bill history has been logged for this bike yet.</p>;
  }

  return (
    <>
      {(backdatedCount > 0 || receiptCount > 0) && (
        <p className={styles.backdateSummary}>
          {realTimeCount} of {rows.length} entries were logged close to when the work was done
          {backdatedCount > 0 && <> - {backdatedCount} {backdatedCount === 1 ? 'was' : 'were'} added later, see the notes below</>}.{' '}
          {receiptCount} of {rows.length} {receiptCount === 1 ? 'has' : 'have'} a receipt or invoice attached.
        </p>
      )}
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Category</th>
            <th>Description</th>
            <th>Cost</th>
            <th>Receipt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const backdated = isBackdated(r.date, r.createdAt);
            const notice = backdated ? backdateNotice(r.date, r.createdAt) : '';
            const isPrePurchase = r.category === 'Modification' && isBeforeProduction(r.date, bike);
            const isImage = r.attachment?.fileType === 'image/jpeg' || r.attachment?.fileType === 'image/png';
            const attachmentUrl = r.attachment ? `/api/tracker/report-attachment/${token}/${encodeURIComponent(r.attachment.blobName)}` : null;
            const isApproved = approved.has(r.id);
            const isJustRequested = justRequested.has(r.id);

            return (
              <tr key={r.id}>
                <td>
                  {fmtDate(r.date)}
                  {isPrePurchase && (
                    <div className={styles.backdateNoteSoft}>Pre-purchase expense (bought before {bike.year})</div>
                  )}
                  {backdated && (
                    <div className={r.attachment ? styles.backdateNoteSoft : styles.backdateNote}>
                      {notice}
                      {r.attachment && ' (receipt attached)'}
                    </div>
                  )}
                </td>
                <td>{r.category}</td>
                <td>{r.description}</td>
                <td>{fmtMoney(r.cost)}</td>
                <td>
                  {!r.attachment ? (
                    <span className={styles.noReceipt}>— none provided</span>
                  ) : isApproved && attachmentUrl ? (
                    <a href={attachmentUrl} target="_blank" rel="noopener" className={styles.receiptLink} title={r.attachment.fileName}>
                      {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={attachmentUrl} alt="" className={styles.receiptThumb} />
                      ) : (
                        <span className={styles.receiptThumbPdf}>PDF</span>
                      )}
                      <span className={styles.receiptLabel}>View</span>
                    </a>
                  ) : isJustRequested ? (
                    <span className={styles.receiptRequestedTag}>⏳ Requested</span>
                  ) : (
                    <label className={styles.receiptAvailableTag}>
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                      ✅ Available on request
                    </label>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>Total logged spend</td>
            <td>{fmtMoney(total)}</td>
          </tr>
        </tfoot>
      </table>

      {done && !showForm && selected.size === 0 && (
        <p className={styles.backdateSummary}>Request sent - the seller has been notified and can approve it directly from their email.</p>
      )}

      {selected.size > 0 && (
        <div className={styles.requestBar}>
          {!showForm ? (
            <>
              <span>{selected.size} receipt{selected.size === 1 ? '' : 's'} selected</span>
              <button type="button" className="submit-button" onClick={() => setShowForm(true)}>
                Request {selected.size} receipt{selected.size === 1 ? '' : 's'}
              </button>
            </>
          ) : (
            <div className={styles.requestForm}>
              <p className={styles.subtext} style={{ margin: '0 0 0.5rem' }}>
                The seller will be asked to share {selected.size} receipt{selected.size === 1 ? '' : 's'}. These may
                contain personal details, so it's their choice.
              </p>
              <input
                type="email"
                placeholder="Your email (optional, so you know when it's decided)"
                value={buyerEmail}
                onChange={(e) => setBuyerEmail(e.target.value)}
                style={{ width: '100%', marginBottom: '0.5rem' }}
              />
              <textarea
                placeholder="A short note for the seller (optional)"
                value={buyerMessage}
                onChange={(e) => setBuyerMessage(e.target.value)}
                rows={2}
                style={{ width: '100%', marginBottom: '0.5rem' }}
              />
              {error && <p className="error-text" role="alert">{error}</p>}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="submit-button" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? 'Sending…' : 'Send request'}
                </button>
                <button type="button" className={styles.backLink} onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
