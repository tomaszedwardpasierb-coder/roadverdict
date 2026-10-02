// Place at: src/lib/tracker/comparisonEntries.ts
//
// Loads a garage comparison for one account: the vehicles it can pick
// (still owned - a transferred, read-only one is a frozen record, not
// something being run), and, for 2-4 of them, their comparison entries in
// the order asked. Shared by the Android app's Compare screen
// (lib/app/compareData.ts) and the AI comparison summary
// (comparisonSummary.ts), so both always compare the same thing. Only the
// account's own vehicles can ever be picked - anything else is ignored.
import { getBikesForUser, isBikeReadOnly } from "@/lib/tracker/bike";
import { getCarsForUser, isCarReadOnly } from "@/lib/tracker/car";
import { buildBikeComparison } from "@/lib/tracker/bikeComparison";
import { buildCarComparison } from "@/lib/tracker/carComparison";
import { MIN_COMPARE_VEHICLES, MAX_COMPARE_VEHICLES, type VehicleComparisonEntry } from "@/lib/tracker/vehicleComparison";
import type { ComparisonPeriod } from "@/lib/tracker/bikeComparisonPeriod";
import type { Currency } from "@/lib/tracker/currency";
import type { DistanceUnit } from "@/lib/tracker/unitFormat";

export type CompareVehicle = { kind: "bike" | "car"; id: string; name: string };

export type LoadedComparison = {
  vehicles: CompareVehicle[];
  // The asked-for ids that are really this account's comparable vehicles,
  // deduplicated, in the order asked.
  ids: string[];
  // Empty unless 2-4 valid ids were asked for.
  entries: VehicleComparisonEntry[];
  // The first vehicle's own settings - every column is shown in these,
  // so the numbers are directly comparable (same as the website).
  currency: Currency;
  distanceUnit: DistanceUnit;
};

export async function loadComparison(email: string, requestedIds: string[], period?: ComparisonPeriod): Promise<LoadedComparison> {
  const [allBikes, allCars] = await Promise.all([getBikesForUser(email), getCarsForUser(email)]);
  const bikes = allBikes.filter((b) => !isBikeReadOnly(b));
  const cars = allCars.filter((c) => !isCarReadOnly(c));
  const vehicles: CompareVehicle[] = [
    ...bikes.map((b) => ({ kind: "bike" as const, id: b.id, name: b.nickname ? `${b.nickname} - ${b.make} ${b.model}` : `${b.make} ${b.model}` })),
    ...cars.map((c) => ({ kind: "car" as const, id: c.id, name: c.nickname ? `${c.nickname} - ${c.make} ${c.model}` : `${c.make} ${c.model}` })),
  ];
  const ids = [...new Set(requestedIds)].filter((id) => vehicles.some((v) => v.id === id));
  const primary = allBikes.find((b) => b.id === ids[0]) ?? allCars.find((c) => c.id === ids[0]);
  const base = { vehicles, ids, currency: primary?.currency ?? "GBP", distanceUnit: primary?.distanceUnit ?? "mi" } as const;
  if (ids.length < MIN_COMPARE_VEHICLES || ids.length > MAX_COMPARE_VEHICLES) return { ...base, entries: [] };

  const [bikeEntries, carEntries] = await Promise.all([
    buildBikeComparison(email, ids.filter((id) => bikes.some((b) => b.id === id)), period),
    buildCarComparison(email, ids.filter((id) => cars.some((c) => c.id === id)), period),
  ]);
  const byId = new Map<string, VehicleComparisonEntry>([
    ...bikeEntries.map((e): [string, VehicleComparisonEntry] => [e.bikeId, { ...e, kind: "bike" as const }]),
    ...carEntries.map((e): [string, VehicleComparisonEntry] => [e.bikeId, e]),
  ]);
  const entries = ids.map((id) => byId.get(id)).filter((e): e is VehicleComparisonEntry => e != null);
  return { ...base, entries: entries.length >= MIN_COMPARE_VEHICLES ? entries : [] };
}
