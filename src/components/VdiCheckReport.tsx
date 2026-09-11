// Place at: src/components/VdiCheckReport.tsx
'use client';
//
// The full VDI check display, extracted so the bike and car Buying
// Guide forms render an IDENTICAL report (same groups, same icons, same
// "not available" fallback wording) rather than two hand-copied JSX
// blocks that would inevitably drift apart - VdiCheckResult is already
// one shared, vehicle-neutral type (see vdiUnlock.ts's own header
// comment on why), so there is nothing car-specific or bike-specific
// about how any of this data should be shown.
//
// Every group here is a genuinely supported VDI check concept, not a
// guess - when a group's own fields are all null/absent for a specific
// vehicle, it still renders its heading plus a plain "Not available for
// this car/bike" note, rather than silently vanishing. That distinction
// matters: a buyer who paid for this report should be able to tell "we
// checked for this and found nothing" apart from "this was never part
// of what got checked" - see FactGroup below.
import type { ReactNode } from 'react';
import type { VdiCheckResult } from '@/lib/tracker/vdiUnlock';
import { VdiIcon } from './VdiIcon';
import { VdiMileageChart } from './VdiMileageChart';

function formatChargeMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

type MotorEntry = NonNullable<VdiCheckResult['motors']>[number];

// The first motor gets a full detail card; every motor after it only
// lists the fields that actually differ (per the user's own explicit
// request) - a dual-motor AWD EV's front/rear motors are usually
// identical apart from location/axle, so repeating every field for each
// one would just be noise.
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

// Renders a group heading, then either its real fact list or a plain
// "not available" note - the one mechanism every group below shares, so
// that fallback wording never drifts between groups or between the
// bike/car forms.
function FactGroup({ title, hasData, vehicleNoun, children }: { title: string; hasData: boolean; vehicleNoun: string; children: ReactNode }) {
  return (
    <>
      <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>{title}</p>
      {hasData ? (
        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>{children}</ul>
      ) : (
        <p className="field-note" style={{ fontStyle: 'italic' }}>Not available for this {vehicleNoun}.</p>
      )}
    </>
  );
}

interface Props {
  vdiCheck: VdiCheckResult;
  vehicleNoun: 'car' | 'bike';
  pricePaidPence: number | null;
  purchasedAt: string | null;
  expiresAt: string | null;
}

export function VdiCheckReport({ vdiCheck: v, vehicleNoun, pricePaidPence, purchasedAt, expiresAt }: Props) {
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

  return (
    <>
      <div style={{ borderLeft: '3px solid var(--verdict-green)', paddingLeft: '0.6rem', marginBottom: '0.6rem' }}>
        <p className="field-note" style={{ fontWeight: 600, margin: 0 }}>
          ✓ Vehicle history report
          {pricePaidPence ? ` - included with your £${(pricePaidPence / 100).toFixed(2)} purchase` : ' - your free Premium report'}
        </p>
        {purchasedAt && (
          <p className="field-note" style={{ margin: '0.2rem 0 0' }}>
            Bought {new Date(purchasedAt).toLocaleDateString('en-GB')}
            {expiresAt && ` - free to look up again until ${new Date(expiresAt).toLocaleDateString('en-GB')}`}.
          </p>
        )}
      </div>

      <p className="field-note" style={{ fontWeight: 600, margin: '0 0 0.3rem' }}>Safety &amp; history</p>
      <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
        <li className="field-note"><VdiIcon name="stolen" /> {v.isStolen ? '⚠️ Recorded as stolen' : 'No stolen marker found'}</li>
        <li className="field-note">
          <VdiIcon name="writeOff" />{' '}
          {!v.hasWriteOffRecord ? (
            'No write-off record found'
          ) : v.writeOffRecords && v.writeOffRecords.length > 0 ? (
            <ul style={{ margin: '0.2rem 0 0', paddingLeft: '1.1rem' }}>
              {v.writeOffRecords.map((r, i) => (
                <li key={i}>
                  ⚠️ {r.status ?? 'Write-off recorded'}
                  {r.insurerName ? ` by ${r.insurerName}` : ''}
                  {r.insurerCode ? ` - ${r.insurerCode}` : ''}
                  {r.lossDate ? ` (${new Date(r.lossDate).toLocaleDateString('en-GB')})` : ''}
                </li>
              ))}
            </ul>
          ) : (
            `⚠️ ${v.writeOffRecordCount} write-off record(s) on file`
          )}
        </li>
        <li className="field-note">
          <VdiIcon name="finance" />{' '}
          {v.hasOutstandingFinance ? `⚠️ ${v.financeRecords.length} outstanding finance agreement(s) on file` : 'No outstanding finance found'}
        </li>
      </ul>

      <FactGroup title="Euro NCAP safety rating" vehicleNoun={vehicleNoun} hasData={v.ncapStarRating != null || v.ncapChildPercent != null || v.ncapAdultPercent != null || v.ncapPedestrianPercent != null || v.ncapSafetyAssistPercent != null}>
        {v.ncapStarRating != null && <li className="field-note"><VdiIcon name="ncap" /> Overall: {v.ncapStarRating} / 5 stars</li>}
        {v.ncapAdultPercent != null && <li className="field-note"><VdiIcon name="ncap" /> Adult occupant: {v.ncapAdultPercent}%</li>}
        {v.ncapChildPercent != null && <li className="field-note"><VdiIcon name="ncap" /> Child occupant: {v.ncapChildPercent}%</li>}
        {v.ncapPedestrianPercent != null && <li className="field-note"><VdiIcon name="ncap" /> Pedestrian: {v.ncapPedestrianPercent}%</li>}
        {v.ncapSafetyAssistPercent != null && <li className="field-note"><VdiIcon name="ncap" /> Safety assist: {v.ncapSafetyAssistPercent}%</li>}
      </FactGroup>

      <FactGroup title="Identity" vehicleNoun={vehicleNoun} hasData={hasIdentity}>
        {v.powertrainType && <li className="field-note"><VdiIcon name="ev" /> Powertrain type: {v.powertrainType}</li>}
        {v.series && <li className="field-note"><VdiIcon name="identity" /> Series: {v.series}</li>}
        {v.platformName && <li className="field-note"><VdiIcon name="identity" /> Platform: {v.platformName}</li>}
        {v.countryOfOrigin && <li className="field-note"><VdiIcon name="origin" /> Country of origin: {v.countryOfOrigin}</li>}
        {v.dvlaFuelType && <li className="field-note"><VdiIcon name="fuelTank" /> DVLA fuel type: {v.dvlaFuelType}</li>}
        {v.bodyStyle && <li className="field-note"><VdiIcon name="bodyType" /> Body style: {v.bodyStyle}</li>}
        {v.dvlaBodyType && <li className="field-note"><VdiIcon name="bodyType" /> DVLA body type: {v.dvlaBodyType}</li>}
        {v.dvlaWheelPlan && <li className="field-note"><VdiIcon name="bodyType" /> Wheel plan: {v.dvlaWheelPlan}</li>}
        {v.typeApprovalCategory && <li className="field-note"><VdiIcon name="approvalCategory" /> Type-approval category: {v.typeApprovalCategory}</li>}
        {(v.modelStartDate || v.modelEndDate) && (
          <li className="field-note">
            <VdiIcon name="productionYears" /> This model was produced:{' '}
            {v.modelStartDate ? new Date(v.modelStartDate).getFullYear() : '?'} - {v.modelEndDate ? new Date(v.modelEndDate).getFullYear() : 'present'}
          </li>
        )}
        {v.dateFirstRegisteredInUk && (
          <li className="field-note"><VdiIcon name="registration" /> First registered in the UK: {new Date(v.dateFirstRegisteredInUk).toLocaleDateString('en-GB')}</li>
        )}
        {v.dateOfManufacture && (
          <li className="field-note"><VdiIcon name="registration" /> Date of manufacture: {new Date(v.dateOfManufacture).toLocaleDateString('en-GB')}</li>
        )}
      </FactGroup>

      <FactGroup title="Dimensions" vehicleNoun={vehicleNoun} hasData={hasDimensions}>
        {v.lengthMm != null && <li className="field-note"><VdiIcon name="dimensions" /> Length: {v.lengthMm.toLocaleString()}mm</li>}
        {v.widthMm != null && <li className="field-note"><VdiIcon name="dimensions" /> Width: {v.widthMm.toLocaleString()}mm</li>}
        {v.heightMm != null && <li className="field-note"><VdiIcon name="dimensions" /> Height: {v.heightMm.toLocaleString()}mm</li>}
        {v.wheelbaseLengthMm != null && <li className="field-note"><VdiIcon name="dimensions" /> Wheelbase: {v.wheelbaseLengthMm.toLocaleString()}mm</li>}
      </FactGroup>

      <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>Colour</p>
      <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
        <li className="field-note">
          <VdiIcon name="colour" />{' '}
          {v.originalColour && v.currentColour && v.originalColour !== v.currentColour
            ? `${v.originalColour.toLowerCase()} → ${v.currentColour.toLowerCase()}`
            : v.currentColour
              ? `Colour: ${v.currentColour.toLowerCase()}`
              : 'Colour not recorded'}
          {' '}({v.colourChangeCount} change(s) on record)
          {v.previousColour ? `, previously ${v.previousColour.toLowerCase()}` : ''}
        </li>
      </ul>

      <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>Ownership history</p>
      <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
        <li className="field-note"><VdiIcon name="keeperChanges" /> {v.keeperChangeCount} keeper change(s) on record</li>
        {v.keeperChanges.length > 0 && (() => {
          const latest = v.keeperChanges[v.keeperChanges.length - 1];
          return (
            <li className="field-note">
              <VdiIcon name="keeperChanges" /> Current keeper since {new Date(latest.keeperStartDate).toLocaleDateString('en-GB')}
              {latest.numberOfPreviousKeepers != null ? ` (${latest.numberOfPreviousKeepers} previous keeper(s))` : ''}
            </li>
          );
        })()}
        <li className="field-note"><VdiIcon name="plateChanges" /> {v.plateChangeCount} plate change(s) on record</li>
        <li className="field-note"><VdiIcon name="tax" /> {v.v5cReissueCount} V5C logbook reissue(s) on record</li>
      </ul>

      <FactGroup title="Status flags" vehicleNoun={vehicleNoun} hasData={hasStatusFlags}>
        {v.isImported && <li className="field-note"><VdiIcon name="imported" /> Imported{v.isImportedFromOutsideEu ? ' (from outside the EU)' : ''}</li>}
        {v.isScrapped && <li className="field-note"><VdiIcon name="scrapped" /> ⚠️ Recorded as scrapped</li>}
        {v.certificateOfDestructionIssued && <li className="field-note"><VdiIcon name="scrapped" /> ⚠️ Certificate of destruction issued</li>}
      </FactGroup>

      <FactGroup title="Running costs" vehicleNoun={vehicleNoun} hasData={hasRunningCosts}>
        {v.vedStandardSixMonths != null && <li className="field-note"><VdiIcon name="tax" /> Road tax (6 months): £{v.vedStandardSixMonths.toFixed(2)}</li>}
        {v.vedStandardTwelveMonths != null && <li className="field-note"><VdiIcon name="tax" /> Road tax (12 months): £{v.vedStandardTwelveMonths.toFixed(2)}</li>}
        {v.vedFirstYearTwelveMonths != null && <li className="field-note"><VdiIcon name="tax" /> Road tax (first year): £{v.vedFirstYearTwelveMonths.toFixed(2)}</li>}
        {v.dvlaCo2 != null && <li className="field-note"><VdiIcon name="co2" /> DVLA CO2: {v.dvlaCo2} g/km{v.dvlaCo2Band ? ` (band ${v.dvlaCo2Band})` : ''}</li>}
        {v.manufacturerCo2 != null && <li className="field-note"><VdiIcon name="co2" /> Manufacturer-quoted CO2: {v.manufacturerCo2} g/km</li>}
        {v.euroStatus && <li className="field-note"><VdiIcon name="co2" /> Euro status: {v.euroStatus}</li>}
      </FactGroup>

      <FactGroup title="Technical spec" vehicleNoun={vehicleNoun} hasData={hasTechnicalSpec}>
        {(v.numberOfCylinders != null || v.cylinderArrangement) && (
          <li className="field-note">
            <VdiIcon name="engine" /> Engine: {[v.cylinderArrangement, v.numberOfCylinders != null ? `${v.numberOfCylinders} cylinders` : null, v.aspiration].filter(Boolean).join(', ')}
          </li>
        )}
        {v.engineCapacityCc != null && <li className="field-note"><VdiIcon name="engine" /> Engine capacity: {v.engineCapacityCc}cc</li>}
        {v.dvlaEngineCapacityCc != null && v.dvlaEngineCapacityCc !== v.engineCapacityCc && (
          <li className="field-note"><VdiIcon name="engine" /> DVLA-registered engine capacity: {v.dvlaEngineCapacityCc}cc</li>
        )}
        {v.transmissionType && (
          <li className="field-note">
            <VdiIcon name="transmission" /> Transmission: {[v.transmissionType, v.numberOfGears != null ? `${v.numberOfGears}-speed` : null, v.driveType, v.drivingAxle ? `${v.drivingAxle} drive` : null].filter(Boolean).join(', ')}
          </li>
        )}
        {v.numberOfSeats != null && <li className="field-note"><VdiIcon name="seats" /> Seats: {v.numberOfSeats}</li>}
        {v.kerbWeightKg != null && <li className="field-note"><VdiIcon name="weight" /> Kerb weight: {v.kerbWeightKg.toLocaleString()} kg</li>}
        {v.unladenWeightKg != null && <li className="field-note"><VdiIcon name="weight" /> Unladen weight: {v.unladenWeightKg.toLocaleString()} kg</li>}
        {v.grossCombinedWeightKg != null && <li className="field-note"><VdiIcon name="weight" /> Gross combined weight: {v.grossCombinedWeightKg.toLocaleString()} kg</li>}
        {v.powerToWeightRatio != null && <li className="field-note"><VdiIcon name="powerToWeightRatio" /> Power-to-weight ratio: {v.powerToWeightRatio} kW/kg</li>}
        {v.fuelTankCapacityLitres != null && <li className="field-note"><VdiIcon name="fuelTank" /> Fuel tank: {v.fuelTankCapacityLitres} litres</li>}
        {v.massInServiceKg != null && <li className="field-note"><VdiIcon name="weight" /> Mass in service: {v.massInServiceKg.toLocaleString()} kg</li>}
        {v.taxationClass && <li className="field-note"><VdiIcon name="approvalCategory" /> Taxation class: {v.taxationClass}</li>}
      </FactGroup>

      <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>Battery</p>
      {hasBattery ? (
        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
          {v.batteries!.map((b, i) => (
            <li className="field-note" key={i}>
              <VdiIcon name="battery" />{' '}
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
            </li>
          ))}
        </ul>
      ) : (
        <p className="field-note" style={{ fontStyle: 'italic' }}>Not available for this {vehicleNoun} - only applies to an electric or hybrid powertrain.</p>
      )}

      <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>Motor{v.motors && v.motors.length > 1 ? 's' : ''}</p>
      {hasMotors ? (
        v.motors!.map((m, i) => {
          const reference = i === 0 ? null : v.motors![0];
          const rows = motorDiffRows(m, reference);
          return (
            <div key={i} style={{ marginBottom: i < v.motors!.length - 1 ? '0.4rem' : 0 }}>
              <p className="field-note" style={{ margin: '0 0 0.15rem' }}>
                <VdiIcon name="motor" /> Motor {i + 1}{m.motorLocation ? ` - ${m.motorLocation}` : ''}
              </p>
              {rows.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                  {rows.map((r, j) => (
                    <li className="field-note" key={j}>{r.label}: {r.value}</li>
                  ))}
                </ul>
              ) : (
                i > 0 && <p className="field-note" style={{ margin: 0, paddingLeft: '1.1rem' }}>Same as Motor 1</p>
              )}
            </div>
          );
        })
      ) : (
        <p className="field-note" style={{ fontStyle: 'italic' }}>Not available for this {vehicleNoun} - only applies to an electric powertrain.</p>
      )}

      <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>
        Charge port{v.chargePorts && v.chargePorts.length > 1 ? 's' : ''}
        {v.isTeslaSuperchargerCompatible ? ' (Tesla Supercharger compatible)' : ''}
      </p>
      {hasChargePorts ? (
        v.chargePorts!.map((p, i) => (
          <div key={i} style={{ marginBottom: '0.5rem' }}>
            <p className="field-note" style={{ margin: '0 0 0.15rem' }}>
              <VdiIcon name="chargePort" /> Charge port {i + 1} of {v.chargePorts!.length}:{' '}
              {[p.portType, p.locationOnVehicle, p.maxChargePowerKw != null ? `max ${p.maxChargePowerKw}kW` : null, p.isStandardChargePort ? 'standard' : 'optional'].filter(Boolean).join(', ')}
            </p>
            {p.chargeTimes.length > 0 && (
              <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.15rem 0.6rem 0.15rem 0', borderBottom: '1px solid var(--border)' }}>Charge rate</th>
                    <th style={{ textAlign: 'left', padding: '0.15rem 0', borderBottom: '1px solid var(--border)' }}>10-80% time</th>
                  </tr>
                </thead>
                <tbody>
                  {p.chargeTimes.map((t, j) => (
                    <tr key={j}>
                      <td style={{ padding: '0.15rem 0.6rem 0.15rem 0' }} className="field-note">{t.chargePortKw}kW</td>
                      <td style={{ padding: '0.15rem 0' }} className="field-note">{formatChargeMinutes(t.timeInMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))
      ) : (
        <p className="field-note" style={{ fontStyle: 'italic' }}>Not available for this {vehicleNoun} - only applies to an electric powertrain.</p>
      )}

      <FactGroup title="Performance" vehicleNoun={vehicleNoun} hasData={hasPerformance}>
        {(v.bhp != null || v.ps != null || v.powerKw != null) && (
          <li className="field-note">
            <VdiIcon name="performance" /> Power: {[
              v.bhp != null ? `${v.bhp} bhp` : null,
              v.ps != null ? `${v.ps} PS` : null,
              v.powerKw != null ? `${v.powerKw}kW` : null,
            ].filter(Boolean).join(' / ')}
            {v.powerRpm != null ? ` at ${v.powerRpm.toLocaleString()} rpm` : ''}
          </li>
        )}
        {v.torqueNm != null && (
          <li className="field-note">
            <VdiIcon name="torque" /> Torque: {v.torqueNm} Nm
            {v.torqueLbFt != null ? ` (${v.torqueLbFt} lb-ft)` : ''}
            {v.torqueRpm != null ? ` at ${v.torqueRpm.toLocaleString()} rpm` : ''}
          </li>
        )}
        {v.zeroToSixtyMph != null && <li className="field-note"><VdiIcon name="topSpeed" /> 0-60mph: {v.zeroToSixtyMph}s</li>}
        {v.zeroToOneHundredKph != null && <li className="field-note"><VdiIcon name="topSpeed" /> 0-100kph: {v.zeroToOneHundredKph}s</li>}
        {(v.maxSpeedMph != null || v.maxSpeedKph != null) && (
          <li className="field-note">
            <VdiIcon name="topSpeed" /> Max speed: {[v.maxSpeedMph != null ? `${v.maxSpeedMph}mph` : null, v.maxSpeedKph != null ? `${v.maxSpeedKph}kph` : null].filter(Boolean).join(' / ')}
          </li>
        )}
        {v.soundLevels && (v.soundLevels.stationaryDb != null || v.soundLevels.driveByDb != null) && (
          <li className="field-note">
            <VdiIcon name="soundLevel" /> Sound level:{' '}
            {[
              v.soundLevels.stationaryDb != null ? `${v.soundLevels.stationaryDb}dB stationary` : null,
              v.soundLevels.driveByDb != null
                ? `${v.soundLevels.driveByDb}dB drive-by${v.soundLevels.engineSpeedRpm != null ? ` at ${v.soundLevels.engineSpeedRpm.toLocaleString()} rpm` : ''}`
                : null,
            ].filter(Boolean).join(', ')}
          </li>
        )}
      </FactGroup>

      {(() => {
        const evT = v.evTransmissions;
        if (!evT || evT.length === 0) return null;
        // Only worth its own line when it actually adds something beyond
        // the top-level transmissionType/numberOfGears already shown
        // above - a single entry matching those is a pure duplicate (see
        // vdiUnlock.ts's own comment). Deliberately no "not available"
        // fallback here - this line is suppressed on purpose, not missing.
        const addsNewInfo = evT.length > 1 || evT[0].transmissionType !== v.transmissionType || evT[0].numberOfGears !== v.numberOfGears;
        if (!addsNewInfo) return null;
        return (
          <ul style={{ margin: '0.3rem 0 0', paddingLeft: '1.1rem' }}>
            {evT.map((t, i) => (
              <li className="field-note" key={i}>
                <VdiIcon name="transmission" /> EV transmission {evT.length > 1 ? `${i + 1} of ${evT.length}` : ''}: {[t.transmissionType, t.numberOfGears != null ? `${t.numberOfGears}-speed` : null].filter(Boolean).join(', ')}
              </li>
            ))}
          </ul>
        );
      })()}

      <FactGroup title="EV performance &amp; range" vehicleNoun={vehicleNoun} hasData={hasEvPerformance}>
        {v.evWhPerMile != null && <li className="field-note"><VdiIcon name="ev" /> Efficiency: {v.evWhPerMile}Wh/mile</li>}
        {v.evMaxChargeInputPowerKw != null && <li className="field-note"><VdiIcon name="chargePort" /> Max charge input power: {v.evMaxChargeInputPowerKw}kW</li>}
        {v.evZeroEmissionMiles != null && <li className="field-note"><VdiIcon name="range" /> Zero-emission range: {v.evZeroEmissionMiles} miles</li>}
        {v.evRealRangeMiles != null && (
          <li className="field-note">
            <VdiIcon name="range" /> Real-world range: {v.evRealRangeMiles} miles{v.evRealRangeKm != null ? ` (${v.evRealRangeKm}km)` : ''}
          </li>
        )}
        {v.evMilesPerChargeHour != null && <li className="field-note"><VdiIcon name="range" /> Miles added per hour of charge: {v.evMilesPerChargeHour}</li>}
        {v.evRangeTestCycles?.map((c, i) => (
          <li className="field-note" key={i}>
            <VdiIcon name="range" /> {c.testType ?? 'Test cycle'} range:{' '}
            {[
              c.combinedRangeMiles != null ? `${c.combinedRangeMiles} miles combined` : null,
              c.combinedRangeKm != null ? `(${c.combinedRangeKm}km)` : null,
              c.cityRangeMiles != null ? `${c.cityRangeMiles} miles city` : null,
            ].filter(Boolean).join(' ')}
          </li>
        ))}
      </FactGroup>

      <FactGroup title="Fuel economy" vehicleNoun={vehicleNoun} hasData={hasFuelEconomy}>
        {v.fuelEconomy?.urbanColdMpg != null && <li className="field-note"><VdiIcon name="fuelEconomy" /> Urban (cold): {v.fuelEconomy.urbanColdMpg}mpg ({v.fuelEconomy.urbanColdL100Km}L/100km)</li>}
        {v.fuelEconomy?.extraUrbanMpg != null && <li className="field-note"><VdiIcon name="fuelEconomy" /> Extra urban: {v.fuelEconomy.extraUrbanMpg}mpg ({v.fuelEconomy.extraUrbanL100Km}L/100km)</li>}
        {v.fuelEconomy?.combinedMpg != null && <li className="field-note"><VdiIcon name="fuelEconomy" /> Combined: {v.fuelEconomy.combinedMpg}mpg ({v.fuelEconomy.combinedL100Km}L/100km)</li>}
      </FactGroup>

      <FactGroup title="Police National Computer record" vehicleNoun={vehicleNoun} hasData={hasPnc}>
        {v.pncDetail?.policeForceName && <li className="field-note"><VdiIcon name="pnc" /> Police force: {v.pncDetail.policeForceName}</li>}
        {v.pncDetail?.currentStatusOnRecord && <li className="field-note"><VdiIcon name="pnc" /> Current status: {v.pncDetail.currentStatusOnRecord}</li>}
        {v.pncDetail?.dateReportedStolen && <li className="field-note"><VdiIcon name="pnc" /> Reported stolen: {new Date(v.pncDetail.dateReportedStolen).toLocaleDateString('en-GB')}</li>}
        {v.pncDetail?.dateRecordAddedToPnc && <li className="field-note"><VdiIcon name="pnc" /> Added to PNC: {new Date(v.pncDetail.dateRecordAddedToPnc).toLocaleDateString('en-GB')}</li>}
      </FactGroup>

      <FactGroup title="Mileage integrity" vehicleNoun={vehicleNoun} hasData={hasMileageStats}>
        {hasMileageStats && (
          <li className="field-note">
            <VdiIcon name="mileage" /> Average annual mileage: {v.calculatedAverageAnnualMileage!.toLocaleString()} mi/year
            (typical for this age: {v.averageMileageForAge!.toLocaleString()})
            {v.mileageAnomalyDetected ? ' - ⚠️ anomaly flagged' : ''}
          </li>
        )}
      </FactGroup>
      {v.mileageReadings && <VdiMileageChart readings={v.mileageReadings} />}

      <FactGroup title="Manufacturer warranty" vehicleNoun={vehicleNoun} hasData={hasWarranty}>
        <li className="field-note">
          <VdiIcon name="warranty" />{' '}
          {[
            v.manufacturerWarrantyMonths ? `${v.manufacturerWarrantyMonths} months` : null,
            v.manufacturerWarrantyMiles ? `${v.manufacturerWarrantyMiles.toLocaleString()} miles` : null,
          ].filter(Boolean).join(' / ')}{' '}
          from new
        </li>
      </FactGroup>

      {v.keeperChanges.length > 0 && (
        <>
          <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>Keeper change history</p>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {[...v.keeperChanges].reverse().map((k, i) => (
              <li key={i} className="field-note">
                {new Date(k.keeperStartDate).toLocaleDateString('en-GB')} - new keeper registered
                {k.previousKeeperDisposalDate ? ` (previous keeper disposed ${new Date(k.previousKeeperDisposalDate).toLocaleDateString('en-GB')})` : ''}
              </li>
            ))}
          </ul>
        </>
      )}

      {v.plateChanges && v.plateChanges.length > 0 && (
        <>
          <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>Plate change history</p>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {[...v.plateChanges].reverse().map((p, i) => (
              <li key={i} className="field-note">
                {p.previousVrm ?? '?'} → {p.currentVrm ?? '?'}
                {p.dateOfTransaction ? ` (${new Date(p.dateOfTransaction).toLocaleDateString('en-GB')})` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
