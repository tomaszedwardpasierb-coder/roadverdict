'use client';
// Place at: src/components/VdiCheckSection.tsx
//
// Shared by both report pages (bike and car) - the fact-display markup
// doesn't differ by vehicle kind, only the server-side data-fetching
// feeding it does (see vdiUnlock.ts's own comment on why VDICheck is
// genuinely vehicle-neutral). `valuation` is simply omitted for bikes.
// Reuses report.module.css directly (both pages already load it) rather
// than the "ticket"/"btn-primary" global classes the buying-guide forms
// use, so this section reads as part of the report, not a bolted-on
// widget in a different visual language.
import { useState } from 'react';
import type { VdiUnlock } from '@/lib/tracker/vdiUnlock';
import styles from '@/app/report/[token]/report.module.css';

const PRICE_LABEL: Record<'bike' | 'car', string> = { bike: '£7.99', car: '£9.99' };
const CHECKOUT_PATH: Record<'bike' | 'car', string> = { bike: '/api/tracker/vdi-checkout', car: '/api/cars/vdi-checkout' };

interface Props {
  vehicleKind: 'bike' | 'car';
  token: string;
  registration: string | null;
  make: string;
  model: string;
  vdiUnlock?: VdiUnlock;
}

function fmtGbp(n: number): string {
  return `£${n.toLocaleString()}`;
}

export function VdiCheckSection({ vehicleKind, token, registration, make, model, vdiUnlock }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUnlock() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(CHECKOUT_PATH[vehicleKind], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? 'Could not start checkout. Please try again.');
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Couldn't reach the payment service. Please try again.");
      setLoading(false);
    }
  }

  const identityLine = (
    <p className={styles.subtext}>
      {make} {model}
      {registration && ` · ${registration}`}
    </p>
  );

  if (!vdiUnlock) {
    return (
      <div className={styles.docPage} id="independent-check">
        <h2 className={styles.docHeading}>Independent Vehicle Check</h2>
        {identityLine}
        <p className={styles.docParagraph}>
          A one-time, independently-run check on this exact vehicle - stolen marker, write-off history,
          outstanding finance, and keeper/plate/colour change history, straight from police/DVLA data, not
          the seller&apos;s own account.
          {vehicleKind === 'car' && ' Includes an independent valuation range too.'}
        </p>
        <button className="btn-primary" type="button" onClick={handleUnlock} disabled={loading}>
          {loading ? 'Starting checkout…' : `Unlock for ${PRICE_LABEL[vehicleKind]}`}
        </button>
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    );
  }

  const { vdiCheck, valuation, aiSummary } = vdiUnlock;

  if (!vdiCheck) {
    return (
      <div className={styles.docPage} id="independent-check">
        <h2 className={styles.docHeading}>Independent Vehicle Check</h2>
        {identityLine}
        <p className={styles.docParagraph}>Your check is being processed - please refresh in a moment.</p>
      </div>
    );
  }

  return (
    <div className={styles.docPage} id="independent-check">
      <h2 className={styles.docHeading}>Independent Vehicle Check</h2>
      {identityLine}

      <dl className={styles.itemByItemList}>
        <div className={styles.itemByItemRow}>
          <dt>Stolen marker</dt>
          <dd>{vdiCheck.isStolen ? '⚠️ Recorded as stolen' : 'None found'}</dd>
        </div>
        <div className={styles.itemByItemRow}>
          <dt>Write-off record</dt>
          <dd>{vdiCheck.hasWriteOffRecord ? `⚠️ ${vdiCheck.writeOffRecordCount} record(s) on file` : 'None found'}</dd>
        </div>
        <div className={styles.itemByItemRow}>
          <dt>Outstanding finance</dt>
          <dd>{vdiCheck.hasOutstandingFinance ? `⚠️ ${vdiCheck.financeRecords.length} agreement(s) on file` : 'None found'}</dd>
        </div>
        <div className={styles.itemByItemRow}>
          <dt>Keeper changes</dt>
          <dd>{vdiCheck.keeperChangeCount}</dd>
        </div>
        <div className={styles.itemByItemRow}>
          <dt>Plate changes</dt>
          <dd>{vdiCheck.plateChangeCount}</dd>
        </div>
        <div className={styles.itemByItemRow}>
          <dt>Colour changes</dt>
          <dd>
            {vdiCheck.colourChangeCount}
            {vdiCheck.currentColour ? ` (currently ${vdiCheck.currentColour.toLowerCase()})` : ''}
          </dd>
        </div>
      </dl>

      {valuation && (
        <>
          <h2 className={styles.docHeading}>Independent valuation</h2>
          <dl className={styles.itemByItemList}>
            {valuation.privateAverage != null && (
              <div className={styles.itemByItemRow}>
                <dt>Private average</dt>
                <dd>{fmtGbp(valuation.privateAverage)}</dd>
              </div>
            )}
            {valuation.privateClean != null && (
              <div className={styles.itemByItemRow}>
                <dt>Private clean</dt>
                <dd>{fmtGbp(valuation.privateClean)}</dd>
              </div>
            )}
            {valuation.dealerForecourt != null && (
              <div className={styles.itemByItemRow}>
                <dt>Dealer forecourt</dt>
                <dd>{fmtGbp(valuation.dealerForecourt)}</dd>
              </div>
            )}
            {valuation.partExchange != null && (
              <div className={styles.itemByItemRow}>
                <dt>Part-exchange</dt>
                <dd>{fmtGbp(valuation.partExchange)}</dd>
              </div>
            )}
          </dl>
        </>
      )}

      {aiSummary && (
        <>
          <h2 className={styles.docHeading}>What this means</h2>
          {aiSummary.keyFindings.length > 0 && (
            <ul className={styles.findingsList}>
              {aiSummary.keyFindings.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
          {aiSummary.valuationNote && <p className={styles.docParagraph}>{aiSummary.valuationNote}</p>}
          <p className={styles.docParagraph}>{aiSummary.summary}</p>
        </>
      )}
    </div>
  );
}
