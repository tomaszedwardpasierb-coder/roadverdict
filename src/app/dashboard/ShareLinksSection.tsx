// Place at: src/app/dashboard/ShareLinksSection.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AttachmentThumb } from './AttachmentThumb';
import { ShareLinksList } from './ShareLinksList';
import type { ShareLinkDoc } from '@/lib/tracker/shareLink';
import type { ReceiptRequestDocView, ReceiptRequestItemView } from '@/lib/tracker/receiptRequest';
import styles from './dashboard.module.css';

type ItemDecision = 'approved' | 'declined' | 'pending';
type SubTab = 'links' | 'requests';

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

function requesterLabel(request: ReceiptRequestDocView): string {
  return request.buyerEmail ? `From ${request.buyerEmail}` : 'From a buyer viewing your report';
}

function ItemRow({
  item,
  decision,
  onChange,
  reason,
  onReasonChange,
  muted,
}: {
  item: ReceiptRequestItemView;
  decision: ItemDecision;
  onChange: (v: ItemDecision) => void;
  reason: string;
  onReasonChange: (v: string) => void;
  muted?: boolean;
}) {
  return (
    <div className={`${styles.requestItemRow} ${muted ? styles.decidedItemRow : ''}`}>
      {item.attachment ? (
        <AttachmentThumb attachment={item.attachment} />
      ) : (
        <span className={styles.noPreviewTag} title="This request was made before previews were added">📄 No preview</span>
      )}
      <span className={styles.requestItemDesc}>
        {item.description}
        {item.priorDecline && (
          <span className={styles.priorDeclineFlag}>
            🔁 Asked again — you declined this on {fmtDateTime(item.priorDecline.decidedAt)}
          </span>
        )}
      </span>
      <div className={styles.requestItemChoices}>
        {(['approved', 'declined', 'pending'] as const).map((option) => (
          <label key={option}>
            <input
              type="radio"
              name={`${item.entryId}::radio`}
              checked={decision === option}
              onChange={() => onChange(option)}
            />
            {option === 'approved' ? 'Share' : option === 'declined' ? "Don't share" : 'Not yet'}
          </label>
        ))}
      </div>
      {decision === 'declined' && (
        <input
          type="text"
          placeholder="Reason (optional) - shown to the buyer instead of the default message"
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          className={styles.declineReasonInput}
        />
      )}
    </div>
  );
}

function RequestCard({ request }: { request: ReceiptRequestDocView }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, ItemDecision>>(() =>
    Object.fromEntries(request.items.map((i) => [i.entryId, i.status]))
  );
  const [reasons, setReasons] = useState<Record<string, string>>(() =>
    Object.fromEntries(request.items.filter((i) => i.reason).map((i) => [i.entryId, i.reason as string]))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stillPending = request.items.filter((i) => i.status === 'pending');
  const alreadyDecided = request.items.filter((i) => i.status !== 'pending');

  async function save() {
    setSubmitting(true);
    setError(null);
    // Only send items whose choice actually changed this session - if
    // we resent an unchanged already-decided item, the server would
    // refresh its decision timestamp to right now, erasing the
    // "decided on [date]" history this exists to preserve.
    const approvedIds = request.items
      .filter((i) => decisions[i.entryId] === 'approved' && i.status !== 'approved')
      .map((i) => i.entryId);
    const declinedIds = request.items
      .filter((i) => decisions[i.entryId] === 'declined' && i.status !== 'declined')
      .map((i) => i.entryId);
    const revertedIds = request.items
      .filter((i) => decisions[i.entryId] === 'pending' && i.status !== 'pending')
      .map((i) => i.entryId);
    try {
      if (approvedIds.length > 0) {
        await fetch(`/api/tracker/receipt-request/${request.id}/decide`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entryIds: approvedIds, decision: 'approved' }),
        });
      }
      // Sent one at a time, since each can carry its own reason - the
      // small extra number of calls costs nothing at this scale and
      // avoids trying to group items by matching reason text.
      for (const id of declinedIds) {
        await fetch(`/api/tracker/receipt-request/${request.id}/decide`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entryIds: [id], decision: 'declined', reason: reasons[id] }),
        });
      }
      if (revertedIds.length > 0) {
        await fetch(`/api/tracker/receipt-request/${request.id}/decide`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entryIds: revertedIds, decision: 'pending' }),
        });
      }
      setCollapsed(true);
      router.refresh();
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (collapsed) {
    return (
      <button
        type="button"
        className={`${styles.requestCard} ${styles.requestCardCollapsed}`}
        onClick={() => setCollapsed(false)}
      >
        <span>
          <span className={styles.requesterLine}>
            {requesterLabel(request)} · {fmtDateTime(request.createdAt)}
          </span>
          <span className={styles.requestCollapsedTally}>
            {alreadyDecided.length} of {request.items.length} decided
          </span>
        </span>
        <span className={styles.requestExpandChevron} aria-hidden="true">▸ Show</span>
      </button>
    );
  }

  return (
    <div className={styles.requestCard}>
      <p className={styles.requesterLine}>
        {requesterLabel(request)} · {fmtDateTime(request.createdAt)}
      </p>
      {request.buyerMessage && <p className={styles.requestCardNote}>&quot;{request.buyerMessage}&quot;</p>}

      {stillPending.length > 0 && (
        <>
          {alreadyDecided.length > 0 && <p className={styles.decisionGroupLabel}>Still needs a decision</p>}
          {stillPending.map((item) => (
            <ItemRow
              key={item.entryId}
              item={item}
              decision={decisions[item.entryId]}
              onChange={(v) => setDecisions((prev) => ({ ...prev, [item.entryId]: v }))}
              reason={reasons[item.entryId] ?? ''}
              onReasonChange={(v) => setReasons((prev) => ({ ...prev, [item.entryId]: v }))}
            />
          ))}
        </>
      )}

      {alreadyDecided.length > 0 && (
        <>
          <p className={styles.decisionGroupLabel}>Already decided</p>
          {alreadyDecided.map((item) => (
            <ItemRow
              key={item.entryId}
              item={item}
              decision={decisions[item.entryId]}
              onChange={(v) => setDecisions((prev) => ({ ...prev, [item.entryId]: v }))}
              reason={reasons[item.entryId] ?? ''}
              onReasonChange={(v) => setReasons((prev) => ({ ...prev, [item.entryId]: v }))}
              muted
            />
          ))}
        </>
      )}

      {error && <p className="error-text" role="alert">{error}</p>}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
        <button type="button" className="submit-button" onClick={save} disabled={submitting}>
          {submitting ? 'Saving…' : 'Save decisions'}
        </button>
        <button type="button" className={styles.iconBtn} onClick={() => setCollapsed(true)}>
          Collapse
        </button>
      </div>
    </div>
  );
}

interface Props {
  links: ShareLinkDoc[];
  bikeNames: Record<string, string>;
  appUrl: string;
  requests: ReceiptRequestDocView[];
}

export function ShareLinksSection({ links, bikeNames, appUrl, requests }: Props) {
  const [tab, setTab] = useState<SubTab>('links');
  const pendingCount = requests.length;

  // If the last pending request gets handled while "Request for
  // receipt access" is the active tab, fall back to the links tab
  // rather than leaving the person looking at a now-hidden tab.
  const activeTab: SubTab = tab === 'requests' && pendingCount === 0 ? 'links' : tab;

  return (
    <>
      <h1 className={styles.heading}>Shareable Links</h1>
      <p className={styles.subtext} style={{ marginBottom: '1rem' }}>
        Every report link you&apos;ve generated, across all your bikes - and any requests to see a receipt that have
        come in through them.
      </p>

      <div className={styles.tabBar}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'links' ? styles.tabActive : ''}`}
          onClick={() => setTab('links')}
        >
          Shareable links generated
        </button>
        {pendingCount > 0 && (
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'requests' ? styles.tabActive : ''}`}
            onClick={() => setTab('requests')}
          >
            Request for receipt access
            <span className={styles.navPendingBadge} aria-label={`${pendingCount} request${pendingCount === 1 ? '' : 's'} waiting on you`} />
          </button>
        )}
      </div>

      {activeTab === 'links' ? (
        <ShareLinksList links={links} bikeNames={bikeNames} appUrl={appUrl} />
      ) : (
        <div>
          <p className={styles.pendingRequestsTitle}>
            {pendingCount} receipt request{pendingCount === 1 ? '' : 's'} waiting on you
          </p>
          {requests.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </div>
      )}
    </>
  );
}
