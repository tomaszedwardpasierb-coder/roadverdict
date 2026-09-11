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
// widget in a different visual language - group sub-headings here are
// plain icon-less <h2 className={styles.docHeading}>, matching exactly
// how "Plate change history"/"Strengths"/"Worth asking about" are
// already styled elsewhere on these same report pages (only each page's
// own ~13 TOP-LEVEL sections get an icon, via that page's own
// SectionHeading helper - a nested sub-heading like these never has one,
// see that helper's own comment in detailed/page.tsx).
//
// Field coverage and the "not available for this vehicle" fallback
// pattern deliberately mirror VdiCheckReport.tsx (the Buying Guide's own
// VDI display) exactly - same VdiCheckResult type, same groups, same
// wording - so a buyer sees the identical report whether they unlocked
// it here or through the Buying Guide's standalone purchase. The two
// aren't merged into one shared component because the markup idiom
// genuinely differs (dl/dt/dd here vs ul/li/field-note there, each
// matching its own page's established visual language) - only the
// per-row icons and the underlying field logic are unified.
import { useState } from 'react';
import type { VdiUnlock, VdiCheckResult } from '@/lib/tracker/vdiUnlock';
import { VDI_CHECK_PRICE_LABEL } from '@/lib/payments/pricing';
import { VdiIcon } from './VdiIcon';
import { VdiMileageChart } from './VdiMileageChart';
import styles from '@/app/report/[token]/report.module.css';
import { FileSearch } from 'lucide-react';

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

type MotorEntry = NonNullable<VdiCheckResult['motors']>[number];

// Same motor-diffing rule as VdiCheckReport.tsx - the first motor gets a
// full detail card, every motor after it only lists what differs.
function motorDiffRows(motor: MotorEntry, reference: MotorEntry | null): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, value: string | number | boolean | null, refValue: string | number | boolean | null | undefined) => {
    if (value == null) return;
    if (reference && refValue === value) return;
    rows.push({ label, value: typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value) });
  };
  add('Type', motor.motorType, reference?.motorType);
  add('Manufacturer', motor.manufacturer, reference?.manufacturer);
  add('Model', motor.model, reference?.model);
  add('Power', motor.powerKw != null ? `${motor.powerKw}kW` : null, reference?.powerKw != null ? `${reference.powerKw}kW` : null);
  add('Max torque', motor.maxTorqueNm != null ? `${motor.maxTorqueNm}Nm` : null, reference?.maxTorqueNm != null ? `${reference.maxTorqueNm}Nm` : null);
  add('Axle driven', motor.axleDrivenByMotor, reference?.axleDrivenByMotor);
  add('Regenerative braking', motor.supportsRegenerativeBraking, reference?.supportsRegenerativeBraking);
  add('Notes', motor.additionalInformation, reference?.additionalInformation);
  return rows;
}

function formatChargeMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
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
        <h2 className={styles.docHeading}>
          <FileSearch size={16} aria-hidden className={styles.docHeadingIcon} />
          Independent Vehicle Check
        </h2>
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

  const { vdiCheck: v, valuation, aiSummary } = vdiUnlock;

  if (!v) {
    return (
      <div className={styles.docPage} id="independent-check">
        <h2 className={styles.docHeading}>
          <FileSearch size={16} aria-hidden className={styles.docHeadingIcon} />
          Independent Vehicle Check
        </h2>
        {identityLine}
        <p className={styles.docParagraph}>Your check is being processed - please refresh in a moment.</p>
      </div>
    );
  }

  const hasIdentity = !!(
    v.series || v.platformName || v.countryOfOrigin || v.dvlaFuelType || v.bodyStyle || v.dvlaBodyType ||
    v.dvlaWheelPlan || v.dateFirstRegisteredInUk || v.dateOfManufacture || v.powertrainType ||
    v.modelStartDate || v.modelEndDate || v.typeApprovalCategory
  );
  const hasDimensions = !!(v.heightMm != null || v.lengthMm != null || v.widthMm != null || v.wheelbaseLengthMm != null);
  const hasStatusFlags = !!(v.isImported || v.isImportedFromOutsideEu || v.isScrapped || v.certificateOfDestructionIssued);
  const hasRunningCosts = !!(
    v.vedStandardSixMonths != null || v.vedStandardTwelveMonths != null || v.vedFirstYearTwelveMonths != null ||
    v.dvlaCo2 != null || v.dvlaCo2Band || v.euroStatus || v.manufacturerCo2 != null
  );
  const hasTechnicalSpec = !!(
    v.cylinderArrangement || v.numberOfCylinders != null || v.aspiration || v.transmissionType || v.numberOfGears != null ||
    v.drivingAxle || v.kerbWeightKg != null || v.grossCombinedWeightKg != null || v.fuelTankCapacityLitres != null ||
    v.engineCapacityCc != null || v.dvlaEngineCapacityCc != null || v.numberOfSeats != null || v.powerToWeightRatio != null ||
    v.unladenWeightKg != null || v.massInServiceKg != null || v.taxationClass
  );
  const hasPerformance = !!(v.bhp != null || v.ps != null || v.torqueNm != null || v.zeroToSixtyMph != null || v.maxSpeedMph != null || v.soundLevels);
  const hasEvPerformance = !!(
    v.evWhPerMile != null || v.evMaxChargeInputPowerKw != null || v.evRealRangeMiles != null || v.evMilesPerChargeHour != null ||
    v.evZeroEmissionMiles != null || (v.evRangeTestCycles && v.evRangeTestCycles.length > 0)
  );
  const hasFuelEconomy = !!v.fuelEconomy;
  const hasPnc = !!v.pncDetail;
  const hasMileageStats = v.calculatedAverageAnnualMileage != null && v.averageMileageForAge != null;
  const hasWarranty = v.manufacturerWarrantyMonths != null || v.manufacturerWarrantyMiles != null;
  const hasBattery = !!(v.batteries && v.batteries.length > 0);
  const hasMotors = !!(v.motors && v.motors.length > 0);
  const hasChargePorts = !!(v.chargePorts && v.chargePorts.length > 0);
  const notAvailable = <p className={styles.docParagraph} style={{ fontStyle: 'italic' }}>Not available for this {vehicleKind}.</p>;

  return (
    <div className={styles.docPage} id="independent-check">
      <h2 className={styles.docHeading}>
        <FileSearch size={16} aria-hidden className={styles.docHeadingIcon} />
        Independent Vehicle Check
      </h2>
      {identityLine}

      <dl className={styles.itemByItemList}>
        <div className={styles.itemByItemRow}>
          <dt><VdiIcon name="stolen" /> Stolen marker</dt>
          <dd>{v.isStolen ? '⚠️ Recorded as stolen' : 'None found'}</dd>
        </div>
        <div className={styles.itemByItemRow}>
          <dt><VdiIcon name="writeOff" /> Write-off record</dt>
          <dd>
            {!v.hasWriteOffRecord ? (
              'None found'
            ) : v.writeOffRecords && v.writeOffRecords.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {v.writeOffRecords.map((r, i) => (
                  <li key={i}>
                    ⚠️ {r.status ?? 'Write-off recorded'}
                    {r.insurerName ? ` by ${r.insurerName}` : ''}
                    {r.insurerCode ? ` - ${r.insurerCode}` : ''}
                    {r.lossDate ? ` (${fmtDate(r.lossDate)})` : ''}
                  </li>
                ))}
              </ul>
            ) : (
              `⚠️ ${v.writeOffRecordCount} record(s) on file`
            )}
          </dd>
        </div>
        <div className={styles.itemByItemRow}>
          <dt><VdiIcon name="finance" /> Outstanding finance</dt>
          <dd>{v.hasOutstandingFinance ? `⚠️ ${v.financeRecords.length} agreement(s) on file` : 'None found'}</dd>
        </div>
      </dl>

      <h2 className={styles.docHeading}>Euro NCAP safety rating</h2>
      {(v.ncapStarRating != null || v.ncapChildPercent != null || v.ncapAdultPercent != null || v.ncapPedestrianPercent != null || v.ncapSafetyAssistPercent != null) ? (
        <dl className={styles.itemByItemList}>
          {v.ncapStarRating != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="ncap" /> Overall</dt><dd>{v.ncapStarRating} / 5 stars</dd></div>}
          {v.ncapAdultPercent != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="ncap" /> Adult occupant</dt><dd>{v.ncapAdultPercent}%</dd></div>}
          {v.ncapChildPercent != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="ncap" /> Child occupant</dt><dd>{v.ncapChildPercent}%</dd></div>}
          {v.ncapPedestrianPercent != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="ncap" /> Pedestrian</dt><dd>{v.ncapPedestrianPercent}%</dd></div>}
          {v.ncapSafetyAssistPercent != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="ncap" /> Safety assist</dt><dd>{v.ncapSafetyAssistPercent}%</dd></div>}
        </dl>
      ) : notAvailable}

      <h2 className={styles.docHeading}>Identity</h2>
      {hasIdentity ? (
        <dl className={styles.itemByItemList}>
          {v.powertrainType && <div className={styles.itemByItemRow}><dt><VdiIcon name="ev" /> Powertrain type</dt><dd>{v.powertrainType}</dd></div>}
          {v.series && <div className={styles.itemByItemRow}><dt><VdiIcon name="identity" /> Series</dt><dd>{v.series}</dd></div>}
          {v.platformName && <div className={styles.itemByItemRow}><dt><VdiIcon name="identity" /> Platform</dt><dd>{v.platformName}</dd></div>}
          {v.countryOfOrigin && <div className={styles.itemByItemRow}><dt><VdiIcon name="origin" /> Country of origin</dt><dd>{v.countryOfOrigin}</dd></div>}
          {v.dvlaFuelType && <div className={styles.itemByItemRow}><dt><VdiIcon name="fuelTank" /> DVLA fuel type</dt><dd>{v.dvlaFuelType}</dd></div>}
          {v.bodyStyle && <div className={styles.itemByItemRow}><dt><VdiIcon name="bodyType" /> Body style</dt><dd>{v.bodyStyle}</dd></div>}
          {v.dvlaBodyType && <div className={styles.itemByItemRow}><dt><VdiIcon name="bodyType" /> DVLA body type</dt><dd>{v.dvlaBodyType}</dd></div>}
          {v.dvlaWheelPlan && <div className={styles.itemByItemRow}><dt><VdiIcon name="bodyType" /> Wheel plan</dt><dd>{v.dvlaWheelPlan}</dd></div>}
          {v.typeApprovalCategory && <div className={styles.itemByItemRow}><dt><VdiIcon name="approvalCategory" /> Type-approval category</dt><dd>{v.typeApprovalCategory}</dd></div>}
          {(v.modelStartDate || v.modelEndDate) && (
            <div className={styles.itemByItemRow}>
              <dt><VdiIcon name="productionYears" /> This model was produced</dt>
              <dd>{v.modelStartDate ? new Date(v.modelStartDate).getFullYear() : '?'} - {v.modelEndDate ? new Date(v.modelEndDate).getFullYear() : 'present'}</dd>
            </div>
          )}
          {v.dateFirstRegisteredInUk && (
            <div className={styles.itemByItemRow}>
              <dt><VdiIcon name="registration" /> Date first registered (UK)</dt>
              <dd>{fmtDate(v.dateFirstRegisteredInUk)}</dd>
            </div>
          )}
          {v.dateOfManufacture && (
            <div className={styles.itemByItemRow}>
              <dt><VdiIcon name="registration" /> Date of manufacture</dt>
              <dd>{fmtDate(v.dateOfManufacture)}</dd>
            </div>
          )}
        </dl>
      ) : notAvailable}

      <h2 className={styles.docHeading}>Dimensions</h2>
      {hasDimensions ? (
        <dl className={styles.itemByItemList}>
          {v.lengthMm != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="dimensions" /> Length</dt><dd>{v.lengthMm.toLocaleString()}mm</dd></div>}
          {v.widthMm != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="dimensions" /> Width</dt><dd>{v.widthMm.toLocaleString()}mm</dd></div>}
          {v.heightMm != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="dimensions" /> Height</dt><dd>{v.heightMm.toLocaleString()}mm</dd></div>}
          {v.wheelbaseLengthMm != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="dimensions" /> Wheelbase</dt><dd>{v.wheelbaseLengthMm.toLocaleString()}mm</dd></div>}
        </dl>
      ) : notAvailable}

      <h2 className={styles.docHeading}>Colour</h2>
      <dl className={styles.itemByItemList}>
        <div className={styles.itemByItemRow}>
          <dt><VdiIcon name="colour" /> Colour</dt>
          <dd>
            {v.originalColour && v.currentColour && v.originalColour !== v.currentColour
              ? `${v.originalColour.toLowerCase()} → ${v.currentColour.toLowerCase()}`
              : v.currentColour
                ? v.currentColour.toLowerCase()
                : 'Not recorded'}
            {v.colourChangeCount > 0 ? ` (${v.colourChangeCount} change${v.colourChangeCount === 1 ? '' : 's'} on record)` : ''}
          </dd>
        </div>
      </dl>

      <h2 className={styles.docHeading}>Ownership history</h2>
      <dl className={styles.itemByItemList}>
        <div className={styles.itemByItemRow}>
          <dt><VdiIcon name="keeperChanges" /> Keeper changes</dt>
          <dd>{v.keeperChangeCount}</dd>
        </div>
        <div className={styles.itemByItemRow}>
          <dt><VdiIcon name="plateChanges" /> Plate changes</dt>
          <dd>{v.plateChangeCount}</dd>
        </div>
        <div className={styles.itemByItemRow}>
          <dt><VdiIcon name="tax" /> V5C reissues</dt>
          <dd>{v.v5cReissueCount}</dd>
        </div>
      </dl>

      <h2 className={styles.docHeading}>Status flags</h2>
      {hasStatusFlags ? (
        <dl className={styles.itemByItemList}>
          {v.isImported && <div className={styles.itemByItemRow}><dt><VdiIcon name="imported" /> Imported</dt><dd>{v.isImportedFromOutsideEu ? 'From outside the EU' : 'Yes'}</dd></div>}
          {v.isScrapped && <div className={styles.itemByItemRow}><dt><VdiIcon name="scrapped" /> Scrapped</dt><dd>⚠️ Recorded as scrapped</dd></div>}
          {v.certificateOfDestructionIssued && <div className={styles.itemByItemRow}><dt><VdiIcon name="scrapped" /> Certificate of destruction</dt><dd>⚠️ Issued</dd></div>}
        </dl>
      ) : notAvailable}

      <h2 className={styles.docHeading}>Running costs</h2>
      {hasRunningCosts ? (
        <dl className={styles.itemByItemList}>
          {(v.vedStandardSixMonths != null || v.vedStandardTwelveMonths != null) && (
            <div className={styles.itemByItemRow}>
              <dt><VdiIcon name="tax" /> Road tax (standard rate)</dt>
              <dd>
                {[
                  v.vedStandardSixMonths != null ? `${fmtGbp(v.vedStandardSixMonths)} for 6 months` : null,
                  v.vedStandardTwelveMonths != null ? `${fmtGbp(v.vedStandardTwelveMonths)} for 12 months` : null,
                ].filter(Boolean).join(' · ')}
              </dd>
            </div>
          )}
          {v.vedFirstYearTwelveMonths != null && (
            <div className={styles.itemByItemRow}><dt><VdiIcon name="tax" /> Road tax (first year)</dt><dd>{fmtGbp(v.vedFirstYearTwelveMonths)}</dd></div>
          )}
          {v.dvlaCo2 != null && (
            <div className={styles.itemByItemRow}><dt><VdiIcon name="co2" /> DVLA CO2</dt><dd>{v.dvlaCo2} g/km{v.dvlaCo2Band ? ` (band ${v.dvlaCo2Band})` : ''}</dd></div>
          )}
          {v.manufacturerCo2 != null && (
            <div className={styles.itemByItemRow}><dt><VdiIcon name="co2" /> Manufacturer-quoted CO2</dt><dd>{v.manufacturerCo2} g/km</dd></div>
          )}
          {v.euroStatus && <div className={styles.itemByItemRow}><dt><VdiIcon name="co2" /> Euro status</dt><dd>{v.euroStatus}</dd></div>}
        </dl>
      ) : notAvailable}

      <h2 className={styles.docHeading}>Technical spec</h2>
      {hasTechnicalSpec ? (
        <dl className={styles.itemByItemList}>
          {(v.numberOfCylinders != null || v.cylinderArrangement) && (
            <div className={styles.itemByItemRow}>
              <dt><VdiIcon name="engine" /> Engine</dt>
              <dd>{[v.cylinderArrangement, v.numberOfCylinders != null ? `${v.numberOfCylinders} cylinders` : null, v.aspiration].filter(Boolean).join(', ')}</dd>
            </div>
          )}
          {v.engineCapacityCc != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="engine" /> Engine capacity</dt><dd>{v.engineCapacityCc}cc</dd></div>}
          {v.dvlaEngineCapacityCc != null && v.dvlaEngineCapacityCc !== v.engineCapacityCc && (
            <div className={styles.itemByItemRow}><dt><VdiIcon name="engine" /> DVLA-registered engine capacity</dt><dd>{v.dvlaEngineCapacityCc}cc</dd></div>
          )}
          {v.transmissionType && (
            <div className={styles.itemByItemRow}>
              <dt><VdiIcon name="transmission" /> Transmission</dt>
              <dd>{[v.transmissionType, v.numberOfGears != null ? `${v.numberOfGears}-speed` : null, v.driveType, v.drivingAxle ? `${v.drivingAxle} drive` : null].filter(Boolean).join(', ')}</dd>
            </div>
          )}
          {v.numberOfSeats != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="seats" /> Seats</dt><dd>{v.numberOfSeats}</dd></div>}
          {v.kerbWeightKg != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="weight" /> Kerb weight</dt><dd>{v.kerbWeightKg.toLocaleString()} kg</dd></div>}
          {v.unladenWeightKg != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="weight" /> Unladen weight</dt><dd>{v.unladenWeightKg.toLocaleString()} kg</dd></div>}
          {v.grossCombinedWeightKg != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="weight" /> Gross combined weight</dt><dd>{v.grossCombinedWeightKg.toLocaleString()} kg</dd></div>}
          {v.massInServiceKg != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="weight" /> Mass in service</dt><dd>{v.massInServiceKg.toLocaleString()} kg</dd></div>}
          {v.powerToWeightRatio != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="powerToWeightRatio" /> Power-to-weight ratio</dt><dd>{v.powerToWeightRatio} kW/kg</dd></div>}
          {v.fuelTankCapacityLitres != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="fuelTank" /> Fuel tank</dt><dd>{v.fuelTankCapacityLitres} litres</dd></div>}
          {v.taxationClass && <div className={styles.itemByItemRow}><dt><VdiIcon name="approvalCategory" /> Taxation class</dt><dd>{v.taxationClass}</dd></div>}
        </dl>
      ) : notAvailable}

      <h2 className={styles.docHeading}>Battery</h2>
      {hasBattery ? (
        <dl className={styles.itemByItemList}>
          {v.batteries!.map((b, i) => (
            <div className={styles.itemByItemRow} key={i}>
              <dt><VdiIcon name="battery" /> Battery{v.batteries!.length > 1 ? ` ${i + 1}` : ''}</dt>
              <dd>
                {[
                  b.totalCapacityKwh != null ? `${b.totalCapacityKwh}kWh total` : null,
                  b.usableCapacityKwh != null ? `${b.usableCapacityKwh}kWh usable` : null,
                  b.chemistry,
                  b.locationOnVehicle,
                ].filter(Boolean).join(', ')}
                {(b.warrantyMonths != null || b.warrantyMiles != null) && (
                  <>
                    {' - battery warranty: '}
                    {[b.warrantyMonths ? `${b.warrantyMonths} months` : null, b.warrantyMiles ? `${b.warrantyMiles.toLocaleString()} miles` : null].filter(Boolean).join(' / ')}
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className={styles.docParagraph} style={{ fontStyle: 'italic' }}>Not available for this {vehicleKind} - only applies to an electric or hybrid powertrain.</p>
      )}

      <h2 className={styles.docHeading}>Motor{v.motors && v.motors.length > 1 ? 's' : ''}</h2>
      {hasMotors ? (
        <dl className={styles.itemByItemList}>
          {v.motors!.map((m, i) => {
            const reference = i === 0 ? null : v.motors![0];
            const rows = motorDiffRows(m, reference);
            return (
              <div className={styles.itemByItemRow} key={i}>
                <dt><VdiIcon name="motor" /> Motor {i + 1}{m.motorLocation ? ` - ${m.motorLocation}` : ''}</dt>
                <dd>{rows.length > 0 ? rows.map((r) => `${r.label}: ${r.value}`).join(' · ') : i > 0 ? 'Same as Motor 1' : ''}</dd>
              </div>
            );
          })}
        </dl>
      ) : (
        <p className={styles.docParagraph} style={{ fontStyle: 'italic' }}>Not available for this {vehicleKind} - only applies to an electric powertrain.</p>
      )}

      <h2 className={styles.docHeading}>
        Charge port{v.chargePorts && v.chargePorts.length > 1 ? 's' : ''}
        {v.isTeslaSuperchargerCompatible ? ' (Tesla Supercharger compatible)' : ''}
      </h2>
      {hasChargePorts ? (
        v.chargePorts!.map((p, i) => (
          <div key={i} style={{ marginBottom: '0.7rem' }}>
            <p className={styles.docParagraph} style={{ margin: '0 0 0.3rem' }}>
              <VdiIcon name="chargePort" /> Charge port {i + 1} of {v.chargePorts!.length}:{' '}
              {[p.portType, p.locationOnVehicle, p.maxChargePowerKw != null ? `max ${p.maxChargePowerKw}kW` : null, p.isStandardChargePort ? 'standard' : 'optional'].filter(Boolean).join(', ')}
            </p>
            {p.chargeTimes.length > 0 && (
              <table style={{ borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.15rem 0.6rem 0.15rem 0', borderBottom: '1px solid var(--border)' }}>Charge rate</th>
                    <th style={{ textAlign: 'left', padding: '0.15rem 0', borderBottom: '1px solid var(--border)' }}>10-80% time</th>
                  </tr>
                </thead>
                <tbody>
                  {p.chargeTimes.map((t, j) => (
                    <tr key={j}>
                      <td style={{ padding: '0.15rem 0.6rem 0.15rem 0' }}>{t.chargePortKw}kW</td>
                      <td style={{ padding: '0.15rem 0' }}>{formatChargeMinutes(t.timeInMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))
      ) : (
        <p className={styles.docParagraph} style={{ fontStyle: 'italic' }}>Not available for this {vehicleKind} - only applies to an electric powertrain.</p>
      )}

      <h2 className={styles.docHeading}>Performance</h2>
      {hasPerformance ? (
        <dl className={styles.itemByItemList}>
          {(v.bhp != null || v.ps != null || v.powerKw != null) && (
            <div className={styles.itemByItemRow}>
              <dt><VdiIcon name="performance" /> Power</dt>
              <dd>
                {[v.bhp != null ? `${v.bhp} bhp` : null, v.ps != null ? `${v.ps} PS` : null, v.powerKw != null ? `${v.powerKw}kW` : null].filter(Boolean).join(' / ')}
                {v.powerRpm != null ? ` at ${v.powerRpm.toLocaleString()} rpm` : ''}
              </dd>
            </div>
          )}
          {v.torqueNm != null && (
            <div className={styles.itemByItemRow}>
              <dt><VdiIcon name="torque" /> Torque</dt>
              <dd>{v.torqueNm} Nm{v.torqueLbFt != null ? ` (${v.torqueLbFt} lb-ft)` : ''}{v.torqueRpm != null ? ` at ${v.torqueRpm.toLocaleString()} rpm` : ''}</dd>
            </div>
          )}
          {v.zeroToSixtyMph != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="topSpeed" /> 0-60mph</dt><dd>{v.zeroToSixtyMph}s</dd></div>}
          {v.zeroToOneHundredKph != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="topSpeed" /> 0-100kph</dt><dd>{v.zeroToOneHundredKph}s</dd></div>}
          {(v.maxSpeedMph != null || v.maxSpeedKph != null) && (
            <div className={styles.itemByItemRow}>
              <dt><VdiIcon name="topSpeed" /> Max speed</dt>
              <dd>{[v.maxSpeedMph != null ? `${v.maxSpeedMph}mph` : null, v.maxSpeedKph != null ? `${v.maxSpeedKph}kph` : null].filter(Boolean).join(' / ')}</dd>
            </div>
          )}
          {v.soundLevels && (v.soundLevels.stationaryDb != null || v.soundLevels.driveByDb != null) && (
            <div className={styles.itemByItemRow}>
              <dt><VdiIcon name="soundLevel" /> Sound levels</dt>
              <dd>
                {[
                  v.soundLevels.stationaryDb != null ? `stationary ${v.soundLevels.stationaryDb} dB` : null,
                  v.soundLevels.driveByDb != null ? `drive-by ${v.soundLevels.driveByDb} dB` : null,
                ].filter(Boolean).join(' · ')}
                {v.soundLevels.engineSpeedRpm != null ? ` (at ${v.soundLevels.engineSpeedRpm.toLocaleString()} rpm)` : ''}
              </dd>
            </div>
          )}
        </dl>
      ) : notAvailable}

      {(() => {
        const evT = v.evTransmissions;
        if (!evT || evT.length === 0) return null;
        const addsNewInfo = evT.length > 1 || evT[0].transmissionType !== v.transmissionType || evT[0].numberOfGears !== v.numberOfGears;
        if (!addsNewInfo) return null;
        return (
          <dl className={styles.itemByItemList}>
            {evT.map((t, i) => (
              <div className={styles.itemByItemRow} key={i}>
                <dt><VdiIcon name="transmission" /> EV transmission {evT.length > 1 ? `${i + 1} of ${evT.length}` : ''}</dt>
                <dd>{[t.transmissionType, t.numberOfGears != null ? `${t.numberOfGears}-speed` : null].filter(Boolean).join(', ')}</dd>
              </div>
            ))}
          </dl>
        );
      })()}

      <h2 className={styles.docHeading}>EV performance &amp; range</h2>
      {hasEvPerformance ? (
        <dl className={styles.itemByItemList}>
          {v.evWhPerMile != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="ev" /> Efficiency</dt><dd>{v.evWhPerMile}Wh/mile</dd></div>}
          {v.evMaxChargeInputPowerKw != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="chargePort" /> Max charge input power</dt><dd>{v.evMaxChargeInputPowerKw}kW</dd></div>}
          {v.evZeroEmissionMiles != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="range" /> Zero-emission range</dt><dd>{v.evZeroEmissionMiles} miles</dd></div>}
          {v.evRealRangeMiles != null && (
            <div className={styles.itemByItemRow}><dt><VdiIcon name="range" /> Real-world range</dt><dd>{v.evRealRangeMiles} miles{v.evRealRangeKm != null ? ` (${v.evRealRangeKm}km)` : ''}</dd></div>
          )}
          {v.evMilesPerChargeHour != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="range" /> Miles added per hour of charge</dt><dd>{v.evMilesPerChargeHour}</dd></div>}
          {v.evRangeTestCycles?.map((c, i) => (
            <div className={styles.itemByItemRow} key={i}>
              <dt><VdiIcon name="range" /> {c.testType ?? 'Test cycle'} range</dt>
              <dd>
                {[
                  c.combinedRangeMiles != null ? `${c.combinedRangeMiles} miles combined` : null,
                  c.combinedRangeKm != null ? `(${c.combinedRangeKm}km)` : null,
                  c.cityRangeMiles != null ? `${c.cityRangeMiles} miles city` : null,
                ].filter(Boolean).join(' ')}
              </dd>
            </div>
          ))}
        </dl>
      ) : notAvailable}

      <h2 className={styles.docHeading}>Fuel economy</h2>
      {hasFuelEconomy ? (
        <dl className={styles.itemByItemList}>
          {v.fuelEconomy?.urbanColdMpg != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="fuelEconomy" /> Urban (cold)</dt><dd>{v.fuelEconomy.urbanColdMpg}mpg ({v.fuelEconomy.urbanColdL100Km}L/100km)</dd></div>}
          {v.fuelEconomy?.extraUrbanMpg != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="fuelEconomy" /> Extra urban</dt><dd>{v.fuelEconomy.extraUrbanMpg}mpg ({v.fuelEconomy.extraUrbanL100Km}L/100km)</dd></div>}
          {v.fuelEconomy?.combinedMpg != null && <div className={styles.itemByItemRow}><dt><VdiIcon name="fuelEconomy" /> Combined</dt><dd>{v.fuelEconomy.combinedMpg}mpg ({v.fuelEconomy.combinedL100Km}L/100km)</dd></div>}
        </dl>
      ) : notAvailable}

      <h2 className={styles.docHeading}>Police National Computer record</h2>
      {hasPnc ? (
        <dl className={styles.itemByItemList}>
          {v.pncDetail?.policeForceName && <div className={styles.itemByItemRow}><dt><VdiIcon name="pnc" /> Police force</dt><dd>{v.pncDetail.policeForceName}</dd></div>}
          {v.pncDetail?.currentStatusOnRecord && <div className={styles.itemByItemRow}><dt><VdiIcon name="pnc" /> Current status</dt><dd>{v.pncDetail.currentStatusOnRecord}</dd></div>}
          {v.pncDetail?.dateReportedStolen && <div className={styles.itemByItemRow}><dt><VdiIcon name="pnc" /> Reported stolen</dt><dd>{fmtDate(v.pncDetail.dateReportedStolen)}</dd></div>}
          {v.pncDetail?.dateRecordAddedToPnc && <div className={styles.itemByItemRow}><dt><VdiIcon name="pnc" /> Added to PNC</dt><dd>{fmtDate(v.pncDetail.dateRecordAddedToPnc)}</dd></div>}
        </dl>
      ) : notAvailable}

      <h2 className={styles.docHeading}>Mileage integrity</h2>
      {hasMileageStats ? (
        <dl className={styles.itemByItemList}>
          <div className={styles.itemByItemRow}>
            <dt><VdiIcon name="mileage" /> Average annual mileage</dt>
            <dd>
              {v.calculatedAverageAnnualMileage!.toLocaleString()} mi/year (typical for this age: {v.averageMileageForAge!.toLocaleString()})
              {v.mileageAnomalyDetected ? ' - ⚠️ anomaly flagged' : ''}
            </dd>
          </div>
        </dl>
      ) : notAvailable}
      {v.mileageReadings && <VdiMileageChart readings={v.mileageReadings} />}

      <h2 className={styles.docHeading}>Manufacturer warranty</h2>
      {hasWarranty ? (
        <dl className={styles.itemByItemList}>
          <div className={styles.itemByItemRow}>
            <dt><VdiIcon name="warranty" /> Whole vehicle</dt>
            <dd>
              {[
                v.manufacturerWarrantyMonths ? `${v.manufacturerWarrantyMonths} months` : null,
                v.manufacturerWarrantyMiles ? `${v.manufacturerWarrantyMiles.toLocaleString()} miles` : null,
              ].filter(Boolean).join(' / ')}{' '}
              from new
            </dd>
          </div>
        </dl>
      ) : notAvailable}

      {v.plateChanges && v.plateChanges.length > 0 && (
        <>
          <h2 className={styles.docHeading}>Plate change history</h2>
          <dl className={styles.itemByItemList}>
            {v.plateChanges.map((p, i) => (
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

      {v.keeperChanges.length > 0 && (
        <>
          <h2 className={styles.docHeading}>Keeper change history</h2>
          <dl className={styles.itemByItemList}>
            {[...v.keeperChanges].reverse().map((k, i) => (
              <div className={styles.itemByItemRow} key={i}>
                <dt>{fmtDate(k.keeperStartDate)}</dt>
                <dd>
                  New keeper registered
                  {k.previousKeeperDisposalDate ? ` (previous keeper disposed ${fmtDate(k.previousKeeperDisposalDate)})` : ''}
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
            {valuation.privateAverage != null && <div className={styles.itemByItemRow}><dt>Private average</dt><dd>{fmtGbp(valuation.privateAverage)}</dd></div>}
            {valuation.privateClean != null && <div className={styles.itemByItemRow}><dt>Private clean</dt><dd>{fmtGbp(valuation.privateClean)}</dd></div>}
            {valuation.dealerForecourt != null && <div className={styles.itemByItemRow}><dt>Dealer forecourt</dt><dd>{fmtGbp(valuation.dealerForecourt)}</dd></div>}
            {valuation.partExchange != null && <div className={styles.itemByItemRow}><dt>Part-exchange</dt><dd>{fmtGbp(valuation.partExchange)}</dd></div>}
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
