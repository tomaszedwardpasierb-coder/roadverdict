// Place at: src/components/MpgCalculator.tsx
'use client';

// One tank's fuel economy, worked out live as it's typed: MPG from miles
// and litres, or L/100km from kilometres and litres - the switch changes
// both, converting the distance already typed rather than losing it -
// plus what the fuel costs per mile (or per 100 km) at a price per litre.
// A UK owner gets this week's official UK averages to pick from; the
// dashboard starts it from the owner's own last tank and last price.
import { useEffect, useId, useRef, useState } from 'react';
import { convertDistance, fuelCostPerDistance, tankEconomy, type EconomyUnit } from '@/lib/fuelEconomy';
import { CURRENCY_SYMBOLS, type Currency } from '@/lib/tracker/currency';
import styles from './MpgCalculator.module.css';

type Fuel = 'petrol' | 'diesel';
type UkPrices = Record<Fuel, { pencePerLitre: number; weekCommencing: string }> & { source: string; sourceUrl: string };

export type MpgCalculatorProps = {
  variant?: 'page' | 'embedded';
  initialUnit?: EconomyUnit;
  // A tank to start from - the dashboard's last full one.
  initialTank?: { miles: number; litres: number } | null;
  currency?: Currency;
  // A price per litre to start from, in `currency` (pounds, not pence),
  // and where it came from.
  initialPrice?: { perLitre: number; label: string } | null;
  // Which UK average to start from when there's no price of the owner's own.
  preferredFuel?: Fuel;
};

// A comma works as the decimal point too - not every owner is in the UK.
function parse(text: string): number {
  return text.trim() === '' ? NaN : Number(text.trim().replace(',', '.'));
}

function rounded(value: number, places: number): string {
  return String(Math.round(value * 10 ** places) / 10 ** places);
}

// DESNZ publishes its weeks as "22/09/2026".
function weekLabel(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split('/').map(Number);
  if (!d || !m || !y) return ddmmyyyy;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function MpgCalculator({
  variant = 'page',
  initialUnit = 'mpg',
  initialTank = null,
  currency = 'GBP',
  initialPrice = null,
  preferredFuel = 'petrol',
}: MpgCalculatorProps) {
  const id = useId();
  // UK pumps price in pence, so a pound owner types pence.
  const inPence = currency === 'GBP';
  const symbol = CURRENCY_SYMBOLS[currency];
  const [unit, setUnit] = useState<EconomyUnit>(initialUnit);
  const [distance, setDistance] = useState(() => (initialTank ? rounded(convertDistance(initialTank.miles, 'mpg', initialUnit), 1) : ''));
  const [litres, setLitres] = useState(() => (initialTank ? rounded(initialTank.litres, 2) : ''));
  const [price, setPrice] = useState(() => (initialPrice ? rounded(inPence ? initialPrice.perLitre * 100 : initialPrice.perLitre, inPence ? 1 : 3) : ''));
  const [priceFrom, setPriceFrom] = useState<string | null>(initialPrice?.label ?? null);
  const [ukPrices, setUkPrices] = useState<UkPrices | null>(null);
  const [averageUsed, setAverageUsed] = useState<Fuel | null>(null);
  // Once a price has been given - the owner's own, typed, or picked - a
  // late-arriving UK average must never replace it.
  const priceSettled = useRef(initialPrice !== null);

  useEffect(() => {
    if (!inPence) return;
    let cancelled = false;
    fetch('/api/fuel-price')
      .then((res) => (res.ok ? (res.json() as Promise<UkPrices>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        setUkPrices(data);
        if (!priceSettled.current) {
          setPrice(rounded(data[preferredFuel].pencePerLitre, 1));
          setAverageUsed(preferredFuel);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [inPence, preferredFuel]);

  function switchUnit(next: EconomyUnit) {
    if (next === unit) return;
    const typed = parse(distance);
    if (Number.isFinite(typed)) setDistance(rounded(convertDistance(typed, unit, next), 1));
    setUnit(next);
  }

  function typePrice(text: string) {
    priceSettled.current = true;
    setPrice(text);
    setAverageUsed(null);
    setPriceFrom(null);
  }

  function pickAverage(fuel: Fuel) {
    if (!ukPrices) return;
    priceSettled.current = true;
    setPrice(rounded(ukPrices[fuel].pencePerLitre, 1));
    setAverageUsed(fuel);
    setPriceFrom(null);
  }

  const economy = tankEconomy(parse(distance), unit, parse(litres));
  const priceValue = parse(price);
  const perLitre = Number.isFinite(priceValue) && priceValue > 0 ? (inPence ? priceValue / 100 : priceValue) : null;
  const perDistance = economy && perLitre ? fuelCostPerDistance(perLitre, economy, unit) : null;
  const money = (value: number) => `${symbol}${value.toFixed(2)}`;
  const miles = unit === 'mpg';

  return (
    <div className={`${styles.calc} ${variant === 'page' ? styles.ticketCalc : ''}`}>
      <div className={variant === 'page' ? styles.ticket : styles.plain}>
        <div className={styles.section}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowLabel}>Your tank</span>
            <span className={styles.eyebrowStep}>Step 1 of 2</span>
          </div>
          <fieldset className={styles.toggle}>
            <legend className={styles.srOnly}>Work it out in</legend>
            {(['mpg', 'l100km'] as const).map((option) => (
              <label key={option} className={styles.toggleOption}>
                <input type="radio" name={`${id}-unit`} value={option} checked={unit === option} onChange={() => switchUnit(option)} />
                <span>{option === 'mpg' ? 'MPG (UK)' : 'L/100km'}</span>
              </label>
            ))}
          </fieldset>
          <div className={styles.fields}>
            <div className={styles.field}>
              <label htmlFor={`${id}-distance`}>{miles ? 'Miles driven' : 'Kilometres driven'}</label>
              <div className={styles.inputWrap}>
                <input
                  id={`${id}-distance`}
                  className={styles.input}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={miles ? 'e.g. 312' : 'e.g. 502'}
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                />
                <span className={styles.suffix} aria-hidden="true">
                  {miles ? 'mi' : 'km'}
                </span>
              </div>
            </div>
            <div className={styles.field}>
              <label htmlFor={`${id}-litres`}>Litres used</label>
              <div className={styles.inputWrap}>
                <input
                  id={`${id}-litres`}
                  className={styles.input}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="e.g. 34.6"
                  value={litres}
                  onChange={(e) => setLitres(e.target.value)}
                />
                <span className={styles.suffix} aria-hidden="true">
                  L
                </span>
              </div>
            </div>
          </div>
          <p className={styles.note}>
            For a true figure: fill to the brim and reset the trip, drive as normal, then brim it again. The trip reading and the
            litres that second fill takes are your numbers.
          </p>
        </div>

        <hr className={styles.divider} />

        <div className={styles.section}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowLabel}>What it costs</span>
            <span className={styles.eyebrowStep}>Step 2 of 2 · optional</span>
          </div>
          <div className={styles.field}>
            <label htmlFor={`${id}-price`}>{inPence ? 'Price per litre (pence)' : `Price per litre (${symbol})`}</label>
            <div className={styles.inputWrap}>
              {inPence ? null : (
                <span className={styles.prefix} aria-hidden="true">
                  {symbol}
                </span>
              )}
              <input
                id={`${id}-price`}
                className={`${styles.input} ${inPence ? '' : styles.withPrefix}`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder={inPence ? 'e.g. 145.9' : 'e.g. 1.75'}
                value={price}
                onChange={(e) => typePrice(e.target.value)}
              />
              {inPence ? (
                <span className={styles.suffix} aria-hidden="true">
                  p
                </span>
              ) : null}
            </div>
          </div>
          {ukPrices ? (
            <>
              <div className={styles.averages}>
                <span>This week&apos;s UK average:</span>
                {(['petrol', 'diesel'] as const).map((fuel) => (
                  <button
                    key={fuel}
                    type="button"
                    className={`${styles.chip} ${averageUsed === fuel ? styles.chipOn : ''}`}
                    aria-pressed={averageUsed === fuel}
                    onClick={() => pickAverage(fuel)}>
                    {fuel === 'petrol' ? 'Petrol' : 'Diesel'} {rounded(ukPrices[fuel].pencePerLitre, 1)}p
                  </button>
                ))}
              </div>
              <p className={styles.source}>
                Week of {weekLabel(ukPrices.petrol.weekCommencing)} -{' '}
                <a href={ukPrices.sourceUrl} target="_blank" rel="noopener noreferrer">
                  {ukPrices.source}
                </a>
                .
              </p>
            </>
          ) : null}
          {priceFrom ? <p className={styles.source}>{priceFrom}</p> : null}
        </div>
      </div>

      <div className={styles.readout} aria-live="polite">
        <p className={styles.readoutLabel}>{variant === 'page' ? 'Your fuel economy' : 'This tank'}</p>
        {economy ? (
          <>
            <p className={styles.big}>
              {(miles ? economy.mpg : economy.l100km).toFixed(1)}
              <span className={styles.bigUnit}>{miles ? 'mpg' : 'L/100km'}</span>
            </p>
            <p className={styles.alt}>
              {miles ? `${economy.l100km.toFixed(1)} L/100km` : `${economy.mpg.toFixed(1)} mpg (UK)`} · {economy.usMpg.toFixed(1)} US mpg
            </p>
            {perDistance !== null && perLitre !== null ? (
              <dl className={styles.lines}>
                <div className={styles.line}>
                  <dt>{miles ? 'Fuel per mile' : 'Fuel per 100 km'}</dt>
                  <dd>{miles && inPence ? `${(perDistance * 100).toFixed(1)}p` : money(perDistance)}</dd>
                </div>
                <div className={styles.line}>
                  <dt>This tank cost</dt>
                  <dd>{money(perLitre * parse(litres))}</dd>
                </div>
              </dl>
            ) : null}
          </>
        ) : (
          <p className={styles.empty}>
            Enter the {miles ? 'miles' : 'kilometres'} and the litres, and your {miles ? 'MPG' : 'L/100km'} shows here.
          </p>
        )}
      </div>
    </div>
  );
}
