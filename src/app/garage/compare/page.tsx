// Place at: src/app/garage/compare/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { isPro } from "@/lib/subscriptions";
import { getBikesForUser, isBikeReadOnly } from "@/lib/tracker/bike";
import { getCarsForUser, isCarReadOnly } from "@/lib/tracker/car";
import { buildBikeComparison } from "@/lib/tracker/bikeComparison";
import { buildCarComparison } from "@/lib/tracker/carComparison";
import { MIN_COMPARE_VEHICLES as MIN_COMPARE, MAX_COMPARE_VEHICLES as MAX_COMPARE } from "@/lib/tracker/vehicleComparison";
import type { VehicleComparisonEntry } from "@/lib/tracker/vehicleComparison";
import type { ComparisonPeriod } from "@/lib/tracker/bikeComparisonPeriod";
import { getExchangeRates } from "@/lib/tracker/currencyRates";
import dashboardStyles from "@/app/dashboard/dashboard.module.css";
import { ProGate } from "@/app/dashboard/ProGate";
import garageStyles from "../garage.module.css";
import { ComparisonPicker } from "./ComparisonPicker";
import { ComparisonTable } from "./ComparisonTable";

export const dynamic = "force-dynamic";

function toIdArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

// searchParams values are always single strings here - a date input
// only ever submits one value, unlike the repeated `vehicles` checkboxes.
function toSingleValue(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v ? v : undefined;
}

export default async function ComparePage(
  props: {
    searchParams: Promise<{ vehicles?: string | string[]; from?: string | string[]; to?: string | string[] }>;
  }
) {
  const searchParams = await props.searchParams;
  const session = await getSession();
  if (!session) redirect("/login");

  const [allBikes, allCars] = await Promise.all([
    getBikesForUser(session.email),
    getCarsForUser(session.email),
  ]);
  // A transferred (read-only) vehicle is a frozen historical record, not
  // something still being actively run day to day - same reasoning
  // countActiveBikes/countActiveCars already use for the free-tier cap,
  // applied here to what's even selectable to compare.
  const comparableBikes = allBikes.filter((b) => !isBikeReadOnly(b));
  const comparableCars = allCars.filter((c) => !isCarReadOnly(c));
  const comparableVehicles = [
    ...comparableBikes.map((b) => ({
      id: b.id,
      name: b.nickname ? `${b.nickname} - ${b.make} ${b.model}` : `${b.make} ${b.model}`,
    })),
    ...comparableCars.map((c) => ({
      id: c.id,
      name: c.nickname ? `${c.nickname} - ${c.make} ${c.model}` : `${c.make} ${c.model}`,
    })),
  ];
  const userIsPro = await isPro(session.email);

  const requestedIds = toIdArray(searchParams.vehicles).filter((id) => comparableVehicles.some((v) => v.id === id));
  const from = toSingleValue(searchParams.from);
  const to = toSingleValue(searchParams.to);

  const selectionError =
    requestedIds.length > 0 && requestedIds.length < MIN_COMPARE
      ? `Pick at least ${MIN_COMPARE} vehicles to compare.`
      : requestedIds.length > MAX_COMPARE
        ? `You can compare up to ${MAX_COMPARE} vehicles at once.`
        : from && to && new Date(from).getTime() > new Date(to).getTime()
          ? `The "From" date must be before the "To" date.`
          : null;

  const showComparison = userIsPro && requestedIds.length >= MIN_COMPARE && requestedIds.length <= MAX_COMPARE && !selectionError;
  const period: ComparisonPeriod | undefined = from || to ? { from, to } : undefined;

  const requestedBikeIds = requestedIds.filter((id) => comparableBikes.some((b) => b.id === id));
  const requestedCarIds = requestedIds.filter((id) => comparableCars.some((c) => c.id === id));
  const [bikeEntries, carEntries] = showComparison
    ? await Promise.all([
        buildBikeComparison(session.email, requestedBikeIds, period),
        buildCarComparison(session.email, requestedCarIds, period),
      ])
    : [[], []];
  // Re-ordered to match requestedIds (the order the checkboxes were
  // submitted in), not "every bike then every car" - the picker's own
  // selection order is what a returning visit via a bookmarked/shared
  // URL should reproduce exactly.
  const entryById = new Map<string, VehicleComparisonEntry>([
    ...bikeEntries.map((e): [string, VehicleComparisonEntry] => [e.bikeId, { ...e, kind: "bike" as const }]),
    ...carEntries.map((e): [string, VehicleComparisonEntry] => [e.bikeId, e]),
  ]);
  const entries = requestedIds.map((id) => entryById.get(id)).filter((e): e is VehicleComparisonEntry => e != null);

  const rates = showComparison ? await getExchangeRates() : null;
  // The first selected vehicle's own display settings become the whole
  // table's shared unit - every value shown is converted to match, so
  // the numbers are directly comparable rather than each vehicle silently
  // showing in its own currency/distance unit.
  const primaryVehicle = showComparison
    ? allBikes.find((b) => b.id === requestedIds[0]) ?? allCars.find((c) => c.id === requestedIds[0])
    : undefined;

  return (
    <main className={dashboardStyles.main}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <Link href="/garage" className={garageStyles.backLink}>← Back to your garage</Link>
      </div>
      <h1 className={dashboardStyles.heading}>Compare vehicles</h1>
      <p className={dashboardStyles.subtext} style={{ marginBottom: "1.3rem" }}>
        Cost per mile is the number a spec sheet can&apos;t give you - real spend divided by miles you&apos;ve
        actually ridden or driven, from your own logged history. Mix bikes and cars freely.
      </p>

      <ProGate
        featureName="Compare vehicles"
        description="See which of your vehicles actually costs less to run per mile, side by side, from your own logged history."
        isPro={userIsPro}
      >
        {comparableVehicles.length < MIN_COMPARE ? (
          <div className={dashboardStyles.card}>
            <p className={dashboardStyles.cardBody}>
              You need at least {MIN_COMPARE} vehicles tracked to compare them. Add another one from your garage first.
            </p>
          </div>
        ) : (
          <>
            <ComparisonPicker
              vehicles={comparableVehicles}
              selectedIds={requestedIds}
              minCompare={MIN_COMPARE}
              maxCompare={MAX_COMPARE}
              from={from}
              to={to}
            />
            {selectionError && (
              <p className="error-text" role="alert" style={{ marginTop: "0.6rem" }}>{selectionError}</p>
            )}
            {showComparison && entries.length >= MIN_COMPARE && primaryVehicle && (
              <div style={{ marginTop: "1.3rem" }}>
                <ComparisonTable
                  entries={entries}
                  currency={primaryVehicle.currency ?? "GBP"}
                  rates={rates}
                  distanceUnit={primaryVehicle.distanceUnit ?? "mi"}
                  period={period ?? null}
                />
              </div>
            )}
            {showComparison && entries.length < MIN_COMPARE && (
              <p className="error-text" role="alert" style={{ marginTop: "0.6rem" }}>
                Couldn&apos;t load enough of those vehicles to compare. Try again.
              </p>
            )}
          </>
        )}
      </ProGate>
    </main>
  );
}
