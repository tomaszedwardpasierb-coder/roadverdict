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
import { VDI_CHECK_PRICE_LABEL } from '@/lib/payments/pricing';
import styles from '@/app/report/[token]/report.module.css';

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

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB');
}

// One glyph per fact row, purely visual - never load-bearing (nothing
// reads these back out), just makes a long fact list easier to scan.
const ICON = {
  stolen: '🛡️',
  writeOff: '💥',
  finance: '💳',
  registeredDate: '📅',
  manufactureDate: '🏭',
  colour: '🎨',
  keeperChanges: '👤',
  plateChanges: '🔢',
  roadTax: '🧾',
  massInService: '⚖️',
  taxationClass: '🏷️',
  power: '⚡',
  soundLevels: '🔊',
  mileage: '🛣️',
} as const;

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
          the seller&apos;s own account. This check cross-references data from the DVLA, the Police National
          Computer (PNC), insurance databases (MIAFTR), and major finance houses, to help confirm this
          vehicle is safe and legal to buy.
          {vehicleKind === 'car' && ' Includes an independent valuation range too.'}
        </p>
        <button className="btn-primary" type="button" onClick={handleUnlock} disabled={loading}>
          {loading ? 'Starting checkout…' : `Unlock for ${VDI_CHECK_PRICE_LABEL[vehicleKind]}`}
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
          <dt>{ICON.stolen} Stolen marker</dt>
          <dd>{vdiCheck.isStolen ? '⚠️ Recorded as stolen' : 'None found'}</dd>
        </div>
        <div className={styles.itemByItemRow}>
          <dt>{ICON.writeOff} Write-off record</dt>
          <dd>
            {!vdiCheck.hasWriteOffRecord ? (
              'None found'
            ) : vdiCheck.writeOffRecords && vdiCheck.writeOffRecords.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {vdiCheck.writeOffRecords.map((r, i) => (
                  <li key={i}>
                    ⚠️ {r.status ?? 'Write-off recorded'}
                    {r.insurerName ? ` by ${r.insurerName}` : ''}
                    {r.insurerCode ? ` - ${r.insurerCode}` : ''}
                    {r.lossDate ? ` (${fmtDate(r.lossDate)})` : ''}
                  </li>
                ))}
              </ul>
            ) : (
              `⚠️ ${vdiCheck.writeOffRecordCount} record(s) on file`
            )}
          </dd>
        </div>
        <div className={styles.itemByItemRow}>
          <dt>{ICON.finance} Outstanding finance</dt>
          <dd>{vdiCheck.hasOutstandingFinance ? `⚠️ ${vdiCheck.financeRecords.length} agreement(s) on file` : 'None found'}</dd>
        </div>
        {vdiCheck.dateFirstRegisteredInUk && (
          <div className={styles.itemByItemRow}>
            <dt>{ICON.registeredDate} Date first registered (UK)</dt>
            <dd>{fmtDate(vdiCheck.dateFirstRegisteredInUk)}</dd>
          </div>
        )}
        {vdiCheck.dateOfManufacture && (
          <div className={styles.itemByItemRow}>
            <dt>{ICON.manufactureDate} Date of manufacture</dt>
            <dd>{fmtDate(vdiCheck.dateOfManufacture)}</dd>
          </div>
        )}
        <div className={styles.itemByItemRow}>
          <dt>{ICON.colour} Colour</dt>
          <dd>
            {vdiCheck.originalColour && vdiCheck.currentColour && vdiCheck.originalColour !== vdiCheck.currentColour
              ? `${vdiCheck.originalColour.toLowerCase()} → ${vdiCheck.currentColour.toLowerCase()}`
              : vdiCheck.currentColour
                ? vdiCheck.currentColour.toLowerCase()
                : 'Not recorded'}
            {vdiCheck.colourChangeCount > 0 ? ` (${vdiCheck.colourChangeCount} change${vdiCheck.colourChangeCount === 1 ? '' : 's'} on record)` : ''}
          </dd>
        </div>
        <div className={styles.itemByItemRow}>
          <dt>{ICON.keeperChanges} Keeper changes</dt>
          <dd>{vdiCheck.keeperChangeCount}</dd>
        </div>
        <div className={styles.itemByItemRow}>
          <dt>{ICON.plateChanges} Plate changes</dt>
          <dd>{vdiCheck.plateChangeCount}</dd>
        </div>
        {(vdiCheck.vedStandardSixMonths != null || vdiCheck.vedStandardTwelveMonths != null) && (
          <div className={styles.itemByItemRow}>
            <dt>{ICON.roadTax} Road tax (standard rate)</dt>
            <dd>
              {[
                vdiCheck.vedStandardSixMonths != null ? `${fmtGbp(vdiCheck.vedStandardSixMonths)} for 6 months` : null,
                vdiCheck.vedStandardTwelveMonths != null ? `${fmtGbp(vdiCheck.vedStandardTwelveMonths)} for 12 months` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </dd>
          </div>
        )}
        {vdiCheck.massInServiceKg != null && (
          <div className={styles.itemByItemRow}>
            <dt>{ICON.massInService} Mass in service</dt>
            <dd>{vdiCheck.massInServiceKg.toLocaleString()} kg</dd>
          </div>
        )}
        {vdiCheck.taxationClass && (
          <div className={styles.itemByItemRow}>
            <dt>{ICON.taxationClass} Taxation class</dt>
            <dd>{vdiCheck.taxationClass}</dd>
          </div>
        )}
        {vdiCheck.bhp != null && (
          <div className={styles.itemByItemRow}>
            <dt>{ICON.power} Power</dt>
            <dd>{vdiCheck.bhp} bhp</dd>
          </div>
        )}
        {vdiCheck.soundLevels && (vdiCheck.soundLevels.stationaryDb != null || vdiCheck.soundLevels.driveByDb != null) && (
          <div className={styles.itemByItemRow}>
            <dt>{ICON.soundLevels} Sound levels</dt>
            <dd>
              {[
                vdiCheck.soundLevels.stationaryDb != null ? `stationary ${vdiCheck.soundLevels.stationaryDb} dB` : null,
                vdiCheck.soundLevels.driveByDb != null ? `drive-by ${vdiCheck.soundLevels.driveByDb} dB` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              {vdiCheck.soundLevels.engineSpeedRpm != null ? ` (at ${vdiCheck.soundLevels.engineSpeedRpm.toLocaleString()} rpm)` : ''}
            </dd>
          </div>
        )}
        {vdiCheck.calculatedAverageAnnualMileage != null && vdiCheck.averageMileageForAge != null && (
          <div className={styles.itemByItemRow}>
            <dt>{ICON.mileage} Average annual mileage</dt>
            <dd>
              {vdiCheck.calculatedAverageAnnualMileage.toLocaleString()} mi/year (typical for this age: {vdiCheck.averageMileageForAge.toLocaleString()})
              {vdiCheck.mileageAnomalyDetected ? ' - ⚠️ anomaly flagged' : ''}
            </dd>
          </div>
        )}
        {(vdiCheck.manufacturerWarrantyMonths != null || vdiCheck.manufacturerWarrantyMiles != null) && (
          <div className={styles.itemByItemRow}>
            <dt>Manufacturer warranty</dt>
            <dd>
              {[
                vdiCheck.manufacturerWarrantyMonths ? `${vdiCheck.manufacturerWarrantyMonths} months` : null,
                vdiCheck.manufacturerWarrantyMiles ? `${vdiCheck.manufacturerWarrantyMiles.toLocaleString()} miles` : null,
              ]
                .filter(Boolean)
                .join(' / ')}{' '}
              from new
            </dd>
          </div>
        )}
      </dl>

      {vdiCheck.plateChanges && vdiCheck.plateChanges.length > 0 && (
        <>
          <h2 className={styles.docHeading}>Plate change history</h2>
          <dl className={styles.itemByItemList}>
            {vdiCheck.plateChanges.map((p, i) => (
              <div className={styles.itemByItemRow} key={i}>
                <dt>{p.dateOfTransaction ? fmtDate(p.dateOfTransaction) : 'Date unknown'}</dt>
                <dd>
                  {p.previousVrm ?? '?'} → {p.currentVrm ?? '?'}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {vdiCheck.keeperChanges.length > 0 && (
        <>
          <h2 className={styles.docHeading}>Keeper change history</h2>
          <dl className={styles.itemByItemList}>
            {[...vdiCheck.keeperChanges].reverse().map((k, i) => (
              <div className={styles.itemByItemRow} key={i}>
                <dt>{new Date(k.keeperStartDate).toLocaleDateString('en-GB')}</dt>
                <dd>
                  New keeper registered
                  {k.previousKeeperDisposalDate ? ` (previous keeper disposed ${new Date(k.previousKeeperDisposalDate).toLocaleDateString('en-GB')})` : ''}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}

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
