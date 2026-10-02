// Place at: src/lib/tracker/comparisonSections.ts
//
// The rows of a vehicle comparison - every label, formatted value and
// "winner" badge - built once here so the website's compare table
// (garage/compare/ComparisonTable.tsx) and the Android app's Compare
// screen (via /api/app/compare) show exactly the same numbers.
import { CURRENCY_SYMBOLS, convertGbpToDisplay, formatCurrency, type Currency, type ExchangeRates } from "@/lib/tracker/currency";
import { formatDistance, KM_PER_MILE, type DistanceUnit } from "@/lib/tracker/unitFormat";
import { buildCostPerMileVerdict, pickWinnerId } from "@/lib/tracker/bikeComparisonVerdict";
import type { VehicleComparisonEntry } from "@/lib/tracker/vehicleComparison";
import type { ComparisonPeriod } from "@/lib/tracker/bikeComparisonPeriod";

function fmtDate(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// "Overall", "since a date", or a specific period all fold into the same
// one label - matches how isDateInRange treats the same from/to pair.
export function periodLabel(period: ComparisonPeriod | null): string {
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

export interface Row {
  label: string;
  values: string[];
  winnerBikeId: string | null;
  badge?: string;
}

export interface ComparisonSection {
  title: string;
  rows: Row[];
}

export function buildComparisonSections({
  entries,
  currency,
  rates,
  distanceUnit,
  period,
}: {
  entries: VehicleComparisonEntry[];
  currency: Currency;
  rates: ExchangeRates | null;
  distanceUnit: DistanceUnit;
  period: ComparisonPeriod | null;
}): { verdict: string | null; label: string; hasCustomPeriod: boolean; sections: ComparisonSection[] } {
  const money = (gbp: number | null) => (gbp == null ? "-" : formatCurrency(gbp, currency, rates));
  const distance = (miles: number | null) => (miles == null ? "-" : formatDistance(miles, distanceUnit));
  const hasCustomPeriod = Boolean(period && (period.from || period.to));
  const label = periodLabel(period);

  const costPerMileWinner = pickWinnerId(entries.map((e) => ({ bikeId: e.bikeId, value: e.costPerMile })), "lower");
  const mpgWinner = pickWinnerId(entries.map((e) => ({ bikeId: e.bikeId, value: e.actualMpg })), "higher");
  const mostRiddenId = pickWinnerId(entries.map((e) => ({ bikeId: e.bikeId, value: e.milesRidden })), "higher");
  const documentationWinner = pickWinnerId(entries.map((e) => ({ bikeId: e.bikeId, value: e.documentationPct })), "higher");

  const verdict = buildCostPerMileVerdict(entries.map((e) => ({ bikeId: e.bikeId, name: e.name, costPerMile: e.costPerMile })));

  const sections: ComparisonSection[] = [
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
          // A car entry's nextDue is always null (no getSellerReportCore
          // equivalent yet - see carComparison.ts) - "Not available yet"
          // there is honest about that gap, distinct from a bike entry
          // genuinely having nothing due, which says so instead.
          values: entries.map((e) =>
            e.kind === "car"
              ? "Not available yet"
              : e.nextDue
                ? `${e.nextDue.name} (${e.nextDue.status === "overdue" ? "overdue" : "due soon"})`
                : "Nothing due soon"
          ),
          winnerBikeId: null,
        },
      ],
    },
    {
      title: "Documentation",
      rows: [
        {
          label: "History with a receipt attached",
          // Same reasoning as "Due soonest" above - null means "not
          // tracked for this vehicle kind yet", not "0%".
          values: entries.map((e) => (e.documentationPct == null ? "Not available yet" : `${e.documentationPct}%`)),
          winnerBikeId: documentationWinner,
          badge: "Best documented",
        },
      ],
    },
  ];

  return { verdict, label, hasCustomPeriod, sections };
}
