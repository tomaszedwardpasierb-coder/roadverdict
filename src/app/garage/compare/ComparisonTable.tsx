// Place at: src/app/garage/compare/ComparisonTable.tsx
import { Fragment } from "react";
import { CURRENCY_SYMBOLS, convertGbpToDisplay, formatCurrency, type Currency, type ExchangeRates } from "@/lib/tracker/currency";
import { formatDistance, KM_PER_MILE, type DistanceUnit } from "@/lib/tracker/unitFormat";
import { buildCostPerMileVerdict, pickWinnerId } from "@/lib/tracker/bikeComparisonVerdict";
import type { BikeComparisonEntry } from "@/lib/tracker/bikeComparison";
import type { ComparisonPeriod } from "@/lib/tracker/bikeComparisonPeriod";
import styles from "../garage.module.css";

function fmtDate(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// "Overall", "since a date", or a specific period all fold into the same
// one label - matches how isDateInRange treats the same from/to pair.
function periodLabel(period: ComparisonPeriod | null): string {
  if (!period || (!period.from && !period.to)) return "overall";
  if (period.from && period.to) return `${fmtDate(period.from)} to ${fmtDate(period.to)}`;
  if (period.from) return `since ${fmtDate(period.from)}`;
  return `up to ${fmtDate(period.to as string)}`;
}

// Cost/mile needs pence-level precision (£0.15/mi, say) - formatCurrency
// deliberately rounds every OTHER money figure on this app to the
// nearest whole unit (a lump cost like £320 has no reason to show
// pence), so this is its own small formatter rather than reusing that
// one for a case it was never meant to handle.
function formatCostPerDistanceUnit(costPerMileGbp: number, currency: Currency, rates: ExchangeRates | null, distanceUnit: DistanceUnit): string {
  const perUnitGbp = distanceUnit === "km" ? costPerMileGbp / KM_PER_MILE : costPerMileGbp;
  const displayValue = convertGbpToDisplay(perUnitGbp, currency, rates);
  return `${CURRENCY_SYMBOLS[currency]}${displayValue.toFixed(2)}/${distanceUnit}`;
}

interface Row {
  label: string;
  values: string[];
  winnerBikeId: string | null;
  badge?: string;
}

export function ComparisonTable({
  entries,
  currency,
  rates,
  distanceUnit,
  period,
}: {
  entries: BikeComparisonEntry[];
  currency: Currency;
  rates: ExchangeRates | null;
  distanceUnit: DistanceUnit;
  period: ComparisonPeriod | null;
}) {
  const money = (gbp: number | null) => (gbp == null ? "-" : formatCurrency(gbp, currency, rates));
  const distance = (miles: number | null) => (miles == null ? "-" : formatDistance(miles, distanceUnit));
  const hasCustomPeriod = Boolean(period && (period.from || period.to));
  const label = periodLabel(period);

  const costPerMileWinner = pickWinnerId(entries.map((e) => ({ bikeId: e.bikeId, value: e.costPerMile })), "lower");
  const mpgWinner = pickWinnerId(entries.map((e) => ({ bikeId: e.bikeId, value: e.actualMpg })), "higher");
  const mostRiddenId = pickWinnerId(entries.map((e) => ({ bikeId: e.bikeId, value: e.milesRidden })), "higher");
  const documentationWinner = pickWinnerId(entries.map((e) => ({ bikeId: e.bikeId, value: e.documentationPct })), "higher");

  const verdict = buildCostPerMileVerdict(entries.map((e) => ({ bikeId: e.bikeId, name: e.name, costPerMile: e.costPerMile })));

  const sections: { title: string; rows: Row[] }[] = [
    {
      title: "Cost",
      rows: [
        {
          label: `Cost per mile (${label})`,
          values: entries.map((e) => (e.costPerMile == null ? "Not enough data" : formatCostPerDistanceUnit(e.costPerMile, currency, rates, distanceUnit))),
          winnerBikeId: costPerMileWinner,
          badge: "Cheaper to run",
        },
        // Breakdown rows first, then the totals they add up to - the
        // standard "components, then the sum" reading order, rather
        // than leading with the total before anyone's seen what's in it.
        { label: "Servicing & repairs", values: entries.map((e) => money(e.spend.servicingTotal)), winnerBikeId: null },
        { label: "Parts & accessories", values: entries.map((e) => money(e.spend.modsTotal)), winnerBikeId: null },
        { label: "Insurance / tax / MOT / finance", values: entries.map((e) => money(e.spend.billsTotal)), winnerBikeId: null },
        { label: "Fuel", values: entries.map((e) => money(e.spend.fuelTotal)), winnerBikeId: null },
        // Redundant once a custom period is already the spend window
        // being shown above - only shown for the default, unfiltered view.
        ...(hasCustomPeriod ? [] : [{ label: "Spend this year", values: entries.map((e) => money(e.yearSpend)), winnerBikeId: null }]),
        { label: `Total spend (${label})`, values: entries.map((e) => money(e.spend.grandTotal)), winnerBikeId: null },
      ],
    },
    {
      title: "Usage",
      rows: [
        { label: "Current mileage", values: entries.map((e) => distance(e.currentMileage)), winnerBikeId: null },
        {
          label: `Miles ridden (${label})`,
          values: entries.map((e) => distance(e.milesRidden)),
          winnerBikeId: mostRiddenId,
          badge: "Most ridden",
        },
        { label: "Average per month", values: entries.map((e) => (e.milesPerMonth == null ? "-" : distance(e.milesPerMonth))), winnerBikeId: null },
        { label: "Owned since", values: entries.map((e) => fmtDate(e.ownedSince)), winnerBikeId: null },
        {
          label: "Actual fuel economy",
          values: entries.map((e) => (e.actualMpg == null ? "Not enough data" : `${e.actualMpg.toFixed(1)} mpg`)),
          winnerBikeId: mpgWinner,
        },
      ],
    },
    {
      title: "Servicing",
      rows: [
        { label: "Services logged", values: entries.map((e) => String(e.serviceCount)), winnerBikeId: null },
        {
          label: "Last service",
          values: entries.map((e) => (e.lastServiceDate ? `${fmtDate(e.lastServiceDate)}${e.lastServiceMileage != null ? ` · ${distance(e.lastServiceMileage)}` : ""}` : "None logged")),
          winnerBikeId: null,
        },
      ],
    },
    {
      title: "Upcoming",
      rows: [
        {
          label: "Due soonest",
          values: entries.map((e) => (e.nextDue ? `${e.nextDue.name} (${e.nextDue.status === "overdue" ? "overdue" : "due soon"})` : "Nothing due soon")),
          winnerBikeId: null,
        },
      ],
    },
    {
      title: "Documentation",
      rows: [
        {
          label: "History with a receipt attached",
          values: entries.map((e) => `${e.documentationPct}%`),
          winnerBikeId: documentationWinner,
          badge: "Best documented",
        },
      ],
    },
  ];

  return (
    <div>
      {verdict && <p className={styles.compareVerdict}>{verdict}</p>}
      <p className="field-note" style={{ marginBottom: "0.8rem" }}>
        Shown in {currency} / {distanceUnit === "km" ? "kilometres" : "miles"}, so every bike is directly comparable regardless of its own display setting.
      </p>
      {hasCustomPeriod && (
        <p className="field-note" style={{ marginBottom: "0.8rem" }}>
          Cost, usage, and servicing rows reflect {label} only. Documentation and what&apos;s due soonest are always
          shown across each bike&apos;s full history, regardless of this filter. Mileage at a specific date is
          approximated from the nearest logged entry around that date, since odometer readings aren&apos;t logged
          continuously.
        </p>
      )}
      <div className={styles.compareTableWrap}>
        <table className={styles.compareTable}>
          <thead>
            <tr>
              <th />
              {entries.map((e) => (
                <th key={e.bikeId}>{e.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => (
              <Fragment key={section.title}>
                <tr className={styles.compareSectionRow}>
                  <td colSpan={entries.length + 1}>{section.title}</td>
                </tr>
                {section.rows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    {entries.map((e, i) => {
                      const isWinner = row.winnerBikeId === e.bikeId;
                      return (
                        <td key={e.bikeId} className={isWinner ? styles.compareWinnerCell : undefined}>
                          {row.values[i]}
                          {isWinner && row.badge && <span className={styles.compareBadge}>{row.badge}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
