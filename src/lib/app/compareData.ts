// Place at: src/lib/app/compareData.ts
//
// The Android app's Compare screen: the same side-by-side comparison as
// the website's /garage/compare (Pro), over each vehicle's whole history,
// with the rows built by the same comparisonSections.ts so the numbers
// match the website exactly. Transferred (read-only) vehicles can't be
// picked, the same as on the website.
import { isPro } from "@/lib/subscriptions";
import { markOnboardingStepComplete } from "@/lib/tracker/userAccount";
import { getBikesForUser, isBikeReadOnly } from "@/lib/tracker/bike";
import { getCarsForUser, isCarReadOnly } from "@/lib/tracker/car";
import { buildBikeComparison } from "@/lib/tracker/bikeComparison";
import { buildCarComparison } from "@/lib/tracker/carComparison";
import { MIN_COMPARE_VEHICLES, MAX_COMPARE_VEHICLES, type VehicleComparisonEntry } from "@/lib/tracker/vehicleComparison";
import { buildComparisonSections } from "@/lib/tracker/comparisonSections";
import { getExchangeRates } from "@/lib/tracker/currencyRates";

export type CompareVehicle = { kind: "bike" | "car"; id: string; name: string };

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
  const [allBikes, allCars, pro] = await Promise.all([getBikesForUser(email), getCarsForUser(email), isPro(email)]);
  const bikes = allBikes.filter((b) => !isBikeReadOnly(b));
  const cars = allCars.filter((c) => !isCarReadOnly(c));
  const vehicles: CompareVehicle[] = [
    ...bikes.map((b) => ({ kind: "bike" as const, id: b.id, name: b.nickname ? `${b.nickname} - ${b.make} ${b.model}` : `${b.make} ${b.model}` })),
    ...cars.map((c) => ({ kind: "car" as const, id: c.id, name: c.nickname ? `${c.nickname} - ${c.make} ${c.model}` : `${c.make} ${c.model}` })),
  ];
  const base = { isPro: pro, min: MIN_COMPARE_VEHICLES, max: MAX_COMPARE_VEHICLES, vehicles };

  const ids = [...new Set(requestedIds)].filter((id) => vehicles.some((v) => v.id === id));
  if (!pro || ids.length < MIN_COMPARE_VEHICLES || ids.length > MAX_COMPARE_VEHICLES) return { ...base, comparison: null };

  const [bikeEntries, carEntries, rates] = await Promise.all([
    buildBikeComparison(email, ids.filter((id) => bikes.some((b) => b.id === id))),
    buildCarComparison(email, ids.filter((id) => cars.some((c) => c.id === id))),
    getExchangeRates(),
  ]);
  const byId = new Map<string, VehicleComparisonEntry>([
    ...bikeEntries.map((e): [string, VehicleComparisonEntry] => [e.bikeId, { ...e, kind: "bike" as const }]),
    ...carEntries.map((e): [string, VehicleComparisonEntry] => [e.bikeId, e]),
  ]);
  const entries = ids.map((id) => byId.get(id)).filter((e): e is VehicleComparisonEntry => e != null);
  if (entries.length < MIN_COMPARE_VEHICLES) return { ...base, comparison: null };

  // The first vehicle's currency and distance unit for every column, the
  // same as the website, so the numbers are directly comparable.
  const primary = allBikes.find((b) => b.id === ids[0]) ?? allCars.find((c) => c.id === ids[0]);
  const currency = primary?.currency ?? "GBP";
  const distanceUnit = primary?.distanceUnit ?? "mi";
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
