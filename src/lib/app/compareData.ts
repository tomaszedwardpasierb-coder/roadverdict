// Place at: src/lib/app/compareData.ts
//
// The Android app's Compare screen: the same side-by-side comparison as
// the website's /garage/compare (Pro), over each vehicle's whole history,
// with the rows built by the same comparisonSections.ts so the numbers
// match the website exactly. Transferred (read-only) vehicles can't be
// picked, the same as on the website.
import { isPro } from "@/lib/subscriptions";
import { markOnboardingStepComplete } from "@/lib/tracker/userAccount";
import { MIN_COMPARE_VEHICLES, MAX_COMPARE_VEHICLES } from "@/lib/tracker/vehicleComparison";
import { buildComparisonSections } from "@/lib/tracker/comparisonSections";
import { loadComparison, type CompareVehicle } from "@/lib/tracker/comparisonEntries";
import { getExchangeRates } from "@/lib/tracker/currencyRates";

export type { CompareVehicle };

export type AppComparison = {
  names: string[];
  verdict: string | null;
  unitNote: string;
  sections: { title: string; rows: { label: string; values: string[]; winnerIndex: number | null; badge: string | null }[] }[];
};

export type AppCompareData = {
  isPro: boolean;
  min: number;
  max: number;
  vehicles: CompareVehicle[];
  // Only when 2-4 of the vehicles above were asked for, on Pro.
  comparison: AppComparison | null;
};

export async function getAppComparison(email: string, requestedIds: string[]): Promise<AppCompareData> {
  const pro = await isPro(email);
  // A free account only gets the list (for the Pro lock's context) - its
  // vehicles' figures are never even loaded.
  const loaded = await loadComparison(email, pro ? requestedIds : []);
  const base = { isPro: pro, min: MIN_COMPARE_VEHICLES, max: MAX_COMPARE_VEHICLES, vehicles: loaded.vehicles };
  const { entries, currency, distanceUnit } = loaded;
  if (!pro || entries.length === 0) return { ...base, comparison: null };

  const rates = await getExchangeRates();
  const { verdict, sections } = buildComparisonSections({ entries, currency, rates, distanceUnit, period: null });
  await markOnboardingStepComplete(email, "compared-vehicles").catch(() => {});

  return {
    ...base,
    comparison: {
      names: entries.map((e) => e.name),
      verdict,
      unitNote: `Shown in ${currency} and ${distanceUnit === "km" ? "kilometres" : "miles"} for every vehicle, so they're directly comparable.`,
      sections: sections.map((section) => ({
        title: section.title,
        rows: section.rows.map((row) => {
          const winner = row.winnerBikeId ? entries.findIndex((e) => e.bikeId === row.winnerBikeId) : -1;
          return { label: row.label, values: row.values, winnerIndex: winner >= 0 ? winner : null, badge: row.badge ?? null };
        }),
      })),
    },
  };
}
