// Place at: src/app/garage/compare/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { isPro } from "@/lib/subscriptions";
import { getBikesForUser, isBikeReadOnly } from "@/lib/tracker/bike";
import { buildBikeComparison, MIN_COMPARE_BIKES as MIN_COMPARE, MAX_COMPARE_BIKES as MAX_COMPARE } from "@/lib/tracker/bikeComparison";
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
// only ever submits one value, unlike the repeated `bikes` checkboxes.
function toSingleValue(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v ? v : undefined;
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: { bikes?: string | string[]; from?: string | string[]; to?: string | string[] };
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const allBikes = await getBikesForUser(session.email);
  // A transferred (read-only) bike is a frozen historical record, not
  // something still being actively run day to day - same reasoning
  // countActiveBikes already uses for the free-tier cap, applied here
  // to what's even selectable to compare.
  const comparableBikes = allBikes.filter((b) => !isBikeReadOnly(b));
  const userIsPro = await isPro(session.email);

  const requestedIds = toIdArray(searchParams.bikes).filter((id) => comparableBikes.some((b) => b.id === id));
  const from = toSingleValue(searchParams.from);
  const to = toSingleValue(searchParams.to);

  const selectionError =
    requestedIds.length > 0 && requestedIds.length < MIN_COMPARE
      ? `Pick at least ${MIN_COMPARE} bikes to compare.`
      : requestedIds.length > MAX_COMPARE
        ? `You can compare up to ${MAX_COMPARE} bikes at once.`
        : from && to && new Date(from).getTime() > new Date(to).getTime()
          ? `The "From" date must be before the "To" date.`
          : null;

  const showComparison = userIsPro && requestedIds.length >= MIN_COMPARE && requestedIds.length <= MAX_COMPARE && !selectionError;
  const period: ComparisonPeriod | undefined = from || to ? { from, to } : undefined;
  const entries = showComparison ? await buildBikeComparison(session.email, requestedIds, period) : [];
  const rates = showComparison ? await getExchangeRates() : null;
  // The first selected bike's own display settings become the whole
  // table's shared unit - every value shown is converted to match, so
  // the numbers are directly comparable rather than each bike silently
  // showing in its own currency/distance unit.
  const primaryBike = showComparison ? allBikes.find((b) => b.id === requestedIds[0]) : undefined;

  return (
    <main className={dashboardStyles.main}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <Link href="/garage" className={garageStyles.backLink}>← Back to your bikes</Link>
      </div>
      <h1 className={dashboardStyles.heading}>Compare bikes</h1>
      <p className={dashboardStyles.subtext} style={{ marginBottom: "1.3rem" }}>
        Cost per mile is the number a spec sheet can&apos;t give you - real spend divided by miles you&apos;ve
        actually ridden, from your own logged history.
      </p>

      <ProGate
        featureName="Compare bikes"
        description="See which of your bikes actually costs less to run per mile, side by side, from your own logged history."
        isPro={userIsPro}
      >
        {comparableBikes.length < MIN_COMPARE ? (
          <div className={dashboardStyles.card}>
            <p className={dashboardStyles.cardBody}>
              You need at least {MIN_COMPARE} bikes tracked to compare them. Add another bike from your garage first.
            </p>
          </div>
        ) : (
          <>
            <ComparisonPicker
              bikes={comparableBikes.map((b) => ({
                id: b.id,
                name: b.nickname ? `${b.nickname} - ${b.make} ${b.model}` : `${b.make} ${b.model}`,
              }))}
              selectedIds={requestedIds}
              minCompare={MIN_COMPARE}
              maxCompare={MAX_COMPARE}
              from={from}
              to={to}
            />
            {selectionError && (
              <p className="error-text" role="alert" style={{ marginTop: "0.6rem" }}>{selectionError}</p>
            )}
            {showComparison && entries.length >= MIN_COMPARE && primaryBike && (
              <div style={{ marginTop: "1.3rem" }}>
                <ComparisonTable
                  entries={entries}
                  currency={primaryBike.currency ?? "GBP"}
                  rates={rates}
                  distanceUnit={primaryBike.distanceUnit ?? "mi"}
                  period={period ?? null}
                />
              </div>
            )}
            {showComparison && entries.length < MIN_COMPARE && (
              <p className="error-text" role="alert" style={{ marginTop: "0.6rem" }}>
                Couldn&apos;t load enough of those bikes to compare. Try again.
              </p>
            )}
          </>
        )}
      </ProGate>
    </main>
  );
}
