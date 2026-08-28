// Place at: src/app/report/[token]/ReportHistoryTable.tsx
'use client';

import { useState } from 'react';
import { isBackdated, backdateNotice } from '@/lib/tracker/backdateCheck';
import { isBeforeProduction } from '@/lib/tracker/productionYearCheck';
import type { ReportRow, EntryRequestStatus } from '@/lib/tracker/sellerReportData';
import type { BikeDoc } from '@/lib/tracker/bike';
import styles from './report.module.css';

function fmtMoney(n: number): string {
  return `£${n.toFixed(2)}`;
}
function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatElapsed(isoDate: string): string {
  const hours = Math.floor((Date.now() - new Date(isoDate).getTime()) / 3600000);
  if (hours < 1) return 'less than an hour ago';
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function ReportHistoryTable({
  rows,
  total,
  bike,
  token,
  backdatedCount,
  realTimeCount,
  receiptCount,
  entryRequestStatus,
}: {
  rows: ReportRow[];
  total: number;
  bike: BikeDoc;
  token: string;
  backdatedCount: number;
  realTimeCount: number;
  receiptCount: number;
  entryRequestStatus: Record<string, EntryRequestStatus>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [justRequested, setJustRequested] = useState<Set<string>>(new Set());
  const [askAgain, setAskAgain] = useState<Set<string>>(new Set());
  const [remindedNow, setRemindedNow] = useState<Set<string>>(new Set());
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [buyerMessage, setBuyerMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A row is selectable (checkbox, counts toward bulk-select) when it
  // has a receipt and isn't already approved, currently pending, or a
  // still-standing decline the buyer hasn't chosen to re-ask about yet.
  function isSelectable(r: ReportRow): boolean {
    if (!r.attachment || justRequested.has(r.id)) return false;
    const status = entryRequestStatus[r.id];
    if (!status) return true;
    if (status.status === 'declined') return askAgain.has(r.id);
    return false; // pending or approved
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll(filterCategory?: string) {
    const ids = rows.filter((r) => isSelectable(r) && (!filterCategory || r.category === filterCategory)).map((r) => r.id);
    setSelected((prev) => new Set([...prev, ...ids]));
  }

  async function handleRemind(entryId: string) {
    setRemindingId(entryId);
    try {
      const res = await fetch(`/api/report/${token}/remind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId }),
      });
      if (res.ok) setRemindedNow((prev) => new Set([...prev, entryId]));
    } finally {
      setRemindingId(null);
    }
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
          buyerMessage: buyerMessage || undefined,
        }),
      });
      if (res.ok) {
        setJustRequested((prev) => new Set([...prev, ...selected]));
        setAskAgain((prev) => {
          const next = new Set(prev);
          selected.forEach((id) => next.delete(id));
          return next;
        });
        setSelected(new Set());
        setShowForm(false);
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

  const selectableCategories = [...new Set(rows.filter(isSelectable).map((r) => r.category))];
  const selectableCount = rows.filter(isSelectable).length;

  return (
    <>
      {(backdatedCount > 0 || receiptCount > 0) && (
        <p className={styles.backdateSummary}>
          {realTimeCount} of {rows.length} entries were logged close to when the work was done
          {backdatedCount > 0 && <> - {backdatedCount} {backdatedCount === 1 ? 'was' : 'were'} added later, see the notes below</>}.{' '}
          {receiptCount} of {rows.length} {receiptCount === 1 ? 'has' : 'have'} a receipt or invoice attached.
        </p>
      )}

      {selectableCount > 1 && (
        <div className={styles.bulkSelectBar}>
          <span>Requesting multiple? </span>
          <button type="button" className={styles.bulkSelectBtn} onClick={() => selectAll()}>
            Select all ({selectableCount})
          </button>
          {selectableCategories.map((cat) => (
            <button key={cat} type="button" className={styles.bulkSelectBtn} onClick={() => selectAll(cat)}>
              {cat} ({rows.filter((r) => isSelectable(r) && r.category === cat).length})
            </button>
          ))}
        </div>
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
            const status = entryRequestStatus[r.id];
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
                    <span className={styles.noReceipt}>- none provided</span>
                  ) : status?.status === 'approved' && attachmentUrl ? (
                    <a href={attachmentUrl} target="_blank" rel="noopener" className={styles.receiptLink} title={r.attachment.fileName}>
                      {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={attachmentUrl} alt="" className={styles.receiptThumb} />
                      ) : (
                        <span className={styles.receiptThumbPdf}>PDF</span>
                      )}
                      <span className={styles.receiptLabel}>View</span>
                    </a>
                  ) : status?.status === 'declined' && !askAgain.has(r.id) ? (
                    <div className={styles.declinedTag}>
                      <p>{status.reason}</p>
                      <button type="button" className={styles.askAgainLink} onClick={() => setAskAgain((prev) => new Set([...prev, r.id]))}>
                        Ask again anyway
                      </button>
                    </div>
                  ) : (status?.status === 'pending' && !isJustRequested) ? (
                    <div className={styles.pendingTag}>
                      <span>⏳ Requested {formatElapsed(status.requestCreatedAt)}</span>
                      <button
                        type="button"
                        className={styles.remindBtn}
                        disabled={(!status.canRemind && !remindedNow.has(r.id)) || remindedNow.has(r.id) || remindingId === r.id}
                        onClick={() => handleRemind(r.id)}
                      >
                        {remindedNow.has(r.id) ? 'Reminded' : remindingId === r.id ? 'Sending…' : 'Remind'}
                      </button>
                    </div>
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
                contain personal details, so it&apos;s their choice. They&apos;ll see this request came in through the link
                you were sent.
              </p>
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
