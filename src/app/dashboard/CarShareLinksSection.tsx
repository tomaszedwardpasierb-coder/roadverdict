// Place at: src/app/dashboard/CarShareLinksSection.tsx
// Car mirror of ShareLinksSection.tsx. The owner-side decide route
// (/api/tracker/receipt-request/[requestId]/decide) is reused directly,
// unmodified from this component's point of view - it was extended to
// check both the bike and car receipt-request collections, so no
// car-specific decide endpoint is needed here.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { VehicleSpinner } from '@/components/VehicleSpinner';
import { Icon } from './Icon';
import { NotificationBell } from './NotificationBell';
import { convertMilesToDisplay, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { AttachmentThumb } from './AttachmentThumb';
import { CarShareLinksList } from './CarShareLinksList';
import { CarExportShareSection } from './CarExportShareSection';
import type { CarShareLinkDoc } from '@/lib/tracker/carShareLink';
import type { CarReceiptRequestDocView, CarReceiptRequestItemView } from '@/lib/tracker/carReceiptRequest';
import styles from './dashboard.module.css';

type ItemDecision = 'approved' | 'declined' | 'pending';
type SubTab = 'links' | 'requests';

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

function requesterLabel(request: CarReceiptRequestDocView): string {
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
  item: CarReceiptRequestItemView;
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
            🔁 Asked again - you declined this on {fmtDateTime(item.priorDecline.decidedAt)}
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

function RequestCard({ request }: { request: CarReceiptRequestDocView }) {
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
      let allOk = true;
      if (approvedIds.length > 0) {
        const res = await fetch(`/api/tracker/receipt-request/${request.id}/decide`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entryIds: approvedIds, decision: 'approved' }),
        });
        if (!res.ok) allOk = false;
      }
      for (const id of declinedIds) {
        const res = await fetch(`/api/tracker/receipt-request/${request.id}/decide`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entryIds: [id], decision: 'declined', reason: reasons[id] }),
        });
        if (!res.ok) allOk = false;
      }
      if (revertedIds.length > 0) {
        const res = await fetch(`/api/tracker/receipt-request/${request.id}/decide`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entryIds: revertedIds, decision: 'pending' }),
        });
        if (!res.ok) allOk = false;
      }
      if (allOk) {
        setCollapsed(true);
        router.refresh();
      } else {
        setError('Could not save all decisions. Please try again.');
      }
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
          {submitting && <VehicleSpinner kind="car" size={20} />}
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
  isPro?: boolean;
  links: CarShareLinkDoc[];
  carNames: Record<string, string>;
  appUrl: string;
  requests: CarReceiptRequestDocView[];
  carNickname?: string;
  registration?: string;
  currentMileage: number;
  distanceUnit: DistanceUnit;
}

export function CarShareLinksSection({ links, carNames, appUrl, requests, carNickname, registration, currentMileage, distanceUnit, isPro = false }: Props) {
  const [tab, setTab] = useState<SubTab>('links');
  const pendingCount = requests.length;

  const activeTab: SubTab = tab === 'requests' && pendingCount === 0 ? 'links' : tab;

  const carTag = (carNickname || registration) ? (
    <span className={styles.headingBikeTag}>
      {carNickname}
      {carNickname && registration && " · "}
      {registration}
    </span>
  ) : null;
  const mileagePill = (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
      <NotificationBell />
      <div className={styles.headerMileagePill}>
        <Icon name="currentMiles" size={15} />
        {Math.round(convertMilesToDisplay(currentMileage, distanceUnit)).toLocaleString()} {distanceUnit === "km" ? "km" : "mi"}
      </div>
    </div>
  );

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>Shareable Links{carTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext} style={{ marginBottom: '1rem' }}>
        Every link you&apos;ve created, and everything it&apos;s proven. Generate a new one any time you&apos;re
        ready to show what this car&apos;s really worth, and review any requests to see a receipt that have come
        in through them.
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
        <>
          <CarExportShareSection isPro={isPro} />
          <CarShareLinksList links={links} carNames={carNames} appUrl={appUrl} />
        </>
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
