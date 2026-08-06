// Place at: src/app/dashboard/ShareLinksSection.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AttachmentThumb } from './AttachmentThumb';
import { ShareLinksList } from './ShareLinksList';
import type { ShareLinkDoc } from '@/lib/tracker/shareLink';
import type { ReceiptRequestDoc } from '@/lib/tracker/receiptRequest';
import styles from './dashboard.module.css';

type ItemDecision = 'approved' | 'declined' | 'pending';
type SubTab = 'links' | 'requests';

function RequestCard({ request, onDecided }: { request: ReceiptRequestDoc; onDecided: () => void }) {
  const [decisions, setDecisions] = useState<Record<string, ItemDecision>>(() =>
    Object.fromEntries(request.items.map((i) => [i.entryId, i.status]))
  );
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSubmitting(true);
    setError(null);
    const approvedIds = Object.entries(decisions).filter(([, v]) => v === 'approved').map(([id]) => id);
    const declinedIds = Object.entries(decisions).filter(([, v]) => v === 'declined').map(([id]) => id);
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
      onDecided();
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.requestCard}>
      <p className={styles.requestCardMeta}>
        {request.buyerEmail ? `From ${request.buyerEmail}` : 'From a buyer viewing your report'} ·{' '}
        {new Date(request.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      </p>
      {request.buyerMessage && <p className={styles.requestCardNote}>&quot;{request.buyerMessage}&quot;</p>}
      {request.items.map((item) => (
        <div key={item.entryId} className={styles.requestItemRow}>
          {item.attachment ? (
            <AttachmentThumb attachment={item.attachment} />
          ) : (
            <span className={styles.noPreviewTag} title="This request was made before previews were added">📄 No preview</span>
          )}
          <span className={styles.requestItemDesc}>{item.description}</span>
          <div className={styles.requestItemChoices}>
            {(['approved', 'declined', 'pending'] as const).map((option) => (
              <label key={option}>
                <input
                  type="radio"
                  name={`${request.id}::${item.entryId}`}
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
              className={styles.declineReasonInput}
            />
          )}
        </div>
      ))}
      {error && <p className="error-text" role="alert">{error}</p>}
      <button type="button" className="submit-button" onClick={save} disabled={submitting}>
        {submitting ? 'Saving…' : 'Save decisions'}
      </button>
    </div>
  );
}

interface Props {
  links: ShareLinkDoc[];
  bikeNames: Record<string, string>;
  appUrl: string;
  requests: ReceiptRequestDoc[];
}

export function ShareLinksSection({ links, bikeNames, appUrl, requests }: Props) {
  const router = useRouter();
  // Requests still awaiting at least one decision - this is what the
  // tab's own existence and the sidebar's orange dot both key off, so
  // the two stay in sync automatically rather than tracked separately.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const pending = requests.filter((r) => !dismissed.has(r.id) && r.items.some((i) => i.status === 'pending'));
  const [tab, setTab] = useState<SubTab>('links');

  // If the last pending request gets handled while "Request for
  // receipt access" is the active tab, fall back to the links tab
  // rather than leaving the person looking at a now-hidden tab.
  const activeTab: SubTab = tab === 'requests' && pending.length === 0 ? 'links' : tab;

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
        {pending.length > 0 && (
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'requests' ? styles.tabActive : ''}`}
            onClick={() => setTab('requests')}
          >
            Request for receipt access
            <span className={styles.navPendingBadge} aria-label={`${pending.length} request${pending.length === 1 ? '' : 's'} waiting on you`} />
          </button>
        )}
      </div>

      {activeTab === 'links' ? (
        <ShareLinksList links={links} bikeNames={bikeNames} appUrl={appUrl} />
      ) : (
        <div>
          <p className={styles.pendingRequestsTitle}>
            {pending.length} receipt request{pending.length === 1 ? '' : 's'} waiting on you
          </p>
          {pending.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              onDecided={() => {
                setDismissed((prev) => new Set([...prev, r.id]));
                router.refresh();
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
