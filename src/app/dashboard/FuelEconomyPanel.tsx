// Place at: src/app/dashboard/FuelEconomyPanel.tsx
'use client';

// The Fuel tab's fuel economy card: the owner's real average from their
// own full tanks, their last full tank, and what a mile costs them at
// their last fill-up's price - with the MPG calculator a tap away,
// started from that same tank and price, for a trip they didn't log or a
// what-if. Nothing in the calculator is saved; logging stays the form
// above it. The public /mpg-calculator page is the same calculator
// without the owner's own numbers.
import { useState } from 'react';
import { MpgCalculator } from '@/components/MpgCalculator';
import { economyFromMpg, fuelCostPerDistance } from '@/lib/fuelEconomy';
import type { FuelEconomySummary } from '@/lib/tracker/fuelEconomySummary';
import { convertMilesToDisplay, formatFuelEconomy, type DistanceUnit, type FuelEconomyUnit } from '@/lib/tracker/unitFormat';
import { CURRENCY_SYMBOLS, type Currency } from '@/lib/tracker/currency';
import styles from './dashboard.module.css';
import ownStyles from './FuelEconomyPanel.module.css';

interface Props {
  vehicleKind: 'bike' | 'car';
  summary: FuelEconomySummary;
  officialMpg: number | null;
  fuelEconomyUnit: FuelEconomyUnit;
  distanceUnit: DistanceUnit;
  currency: Currency;
  // Which of this week's UK averages the calculator offers first when
  // there's no fill-up price of the owner's own.
  preferredFuel: 'petrol' | 'diesel';
}

// Fuel log dates are plain calendar days.
function shortDate(day: string): string {
  return new Date(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function FuelEconomyPanel({ vehicleKind, summary, officialMpg, fuelEconomyUnit, distanceUnit, currency, preferredFuel }: Props) {
  const [open, setOpen] = useState(false);
  const { averageMpg, trustedTanks, lastTank, lastPrice } = summary;
  const noun = vehicleKind === 'bike' ? 'bike' : 'car';
  const symbol = CURRENCY_SYMBOLS[currency];
  const inPence = currency === 'GBP';
  const perMile = fuelEconomyUnit === 'mpg';

  const typicalMpg = averageMpg ?? lastTank?.mpg ?? null;
  const perDistance = typicalMpg && lastPrice ? fuelCostPerDistance(lastPrice.perLitre, economyFromMpg(typicalMpg), fuelEconomyUnit) : null;
  const perDistanceText = perDistance === null ? null : perMile && inPence ? `${(perDistance * 100).toFixed(1)}p` : `${symbol}${perDistance.toFixed(2)}`;
  const priceText = lastPrice ? (inPence ? `${(lastPrice.perLitre * 100).toFixed(1)}p` : `${symbol}${lastPrice.perLitre.toFixed(3)}`) : null;

  return (
    <section className={styles.card} aria-labelledby="fuel-economy-heading">
      <h2 id="fuel-economy-heading" className={styles.chartCardTitle}>
        Fuel economy
      </h2>

      {averageMpg !== null ? (
        <div className={ownStyles.stats}>
          <div className={ownStyles.stat}>
            <span className={ownStyles.statLabel}>Your average</span>
            <span className={ownStyles.statValue}>{formatFuelEconomy(averageMpg, fuelEconomyUnit)}</span>
            <span className={ownStyles.statNote}>
              from {trustedTanks} full tank{trustedTanks === 1 ? '' : 's'}
            </span>
          </div>
          {lastTank ? (
            <div className={ownStyles.stat}>
              <span className={ownStyles.statLabel}>Last full tank</span>
              <span className={ownStyles.statValue}>{formatFuelEconomy(lastTank.mpg, fuelEconomyUnit)}</span>
              <span className={ownStyles.statNote}>
                {Math.round(convertMilesToDisplay(lastTank.miles, distanceUnit)).toLocaleString('en-GB')} {distanceUnit === 'km' ? 'km' : 'mi'} on{' '}
                {lastTank.litres.toFixed(1)} L · {shortDate(lastTank.date)}
              </span>
            </div>
          ) : null}
          {perDistanceText && priceText ? (
            <div className={ownStyles.stat}>
              <span className={ownStyles.statLabel}>{perMile ? 'Fuel per mile' : 'Fuel per 100 km'}</span>
              <span className={ownStyles.statValue}>{perDistanceText}</span>
              <span className={ownStyles.statNote}>at {priceText} a litre, your last fill-up</span>
            </div>
          ) : null}
        </div>
      ) : (
        <p className={ownStyles.note}>
          Log two full-tank fill-ups in a row and your {noun}&apos;s real average shows here - worked out from what actually went in the
          tank, not the manufacturer&apos;s claim.
        </p>
      )}

      {averageMpg !== null && officialMpg ? (
        <p className={ownStyles.note}>
          The official combined figure for this exact {noun} is {formatFuelEconomy(officialMpg, fuelEconomyUnit)}. Yours is real-world, on
          your own roads.
        </p>
      ) : null}

      <div className={ownStyles.actions}>
        <button type="button" className={ownStyles.toggle} aria-expanded={open} aria-controls="fuel-economy-calculator" onClick={() => setOpen((v) => !v)}>
          {open ? 'Close the calculator' : 'Work out a tank'}
        </button>
        <span className={ownStyles.hint}>A trip you didn&apos;t log, or a what-if - nothing here is saved.</span>
      </div>

      {open ? (
        <div id="fuel-economy-calculator" className={ownStyles.calc}>
          <MpgCalculator
            variant="embedded"
            initialUnit={fuelEconomyUnit}
            initialTank={lastTank ? { miles: lastTank.miles, litres: lastTank.litres } : null}
            currency={currency}
            initialPrice={lastPrice ? { perLitre: lastPrice.perLitre, label: `Your last fill-up, ${shortDate(lastPrice.date)}.` } : null}
            preferredFuel={preferredFuel}
          />
        </div>
      ) : null}
    </section>
  );
}
