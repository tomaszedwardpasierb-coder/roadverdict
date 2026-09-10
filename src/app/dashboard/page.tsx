// Place at: src/app/dashboard/page.tsx
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import styles from "./dashboard.module.css";
import LogoutButton from "./LogoutButton";
import { getBikesForUser, pickActiveBike, getCurrentRegistration, isBikeReadOnly } from "@/lib/tracker/bike";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getFuelLogs, computeActualMPG, computeMPGSeries } from "@/lib/tracker/fuelLog";
import { getMods } from "@/lib/tracker/mod";
import { getBills } from "@/lib/tracker/bill";
import { getLabour } from "@/lib/tracker/labour";
import { LABOUR_LABELS } from "@/lib/tracker/labourTypes";
import { getBillSeriesForBike, materializeAllDueForBike } from "@/lib/tracker/billSeries";
import { getReminders, computeReminderStatus } from "@/lib/tracker/reminder";
import { getShareLinksForUser } from "@/lib/tracker/shareLink";
import { getPendingReceiptRequestsForOwner } from "@/lib/tracker/receiptRequest";
import { ShareLinksSection } from "./ShareLinksSection";
import { getCarShareLinksForUser } from "@/lib/tracker/carShareLink";
import { getPendingCarReceiptRequestsForOwner } from "@/lib/tracker/carReceiptRequest";
import { CarShareLinksSection } from "./CarShareLinksSection";
import { computeSpendSummary, computeYearSpend, gatherMileagePoints } from "@/lib/tracker/summary";
import { slugifyMake, getBikeClassForCC, getModelsForBrand } from "@/lib/motorcycleModels";
import { BRAND_OPTIONS, type Region } from "@/lib/priceData";
import { JOB_LABELS } from "@/lib/tracker/jobTypes";
import { BILL_LABELS } from "@/lib/tracker/billTypes";
import {
  formatDistance,
  formatFuelEconomy,
  formatCostPerDistance,
  convertMilesToDisplay,
  type DistanceUnit,
  type FuelEconomyUnit,
} from "@/lib/tracker/unitFormat";
import { type Currency, formatCurrency } from "@/lib/tracker/currency";
import { getExchangeRates } from "@/lib/tracker/currencyRates";
import { AddBikeForm } from "./AddBikeForm";
import { SetRegionForm } from "./SetRegionForm";
import { LogServiceForm } from "./LogServiceForm";
import { LogFuelForm } from "./LogFuelForm";
import { LogModForm } from "./LogModForm";
import { LogBillForm } from "./LogBillForm";
import { LogLabourForm } from "./LogLabourForm";
import { ServiceHistoryCard } from "./ServiceHistoryCard";
import { FuelLogCard } from "./FuelLogCard";
import { ModCard } from "./ModCard";
import { BillCard } from "./BillCard";
import { LabourCard } from "./LabourCard";
import { BillSeriesSummary } from "./BillSeriesSummary";
import { ExcludeFromReportToggle } from "./ExcludeFromReportToggle";
import { ReminderItem } from "./ReminderItem";
import { BudgetWidget } from "./BudgetWidget";
import { SpendDonutChart } from "./SpendDonutChart";
import { MileageChart } from "./MileageChart";
import { MpgChart } from "./MpgChart";
import { FuelCostChart } from "./FuelCostChart";
import { CategorySpendChart } from "./CategorySpendChart";
import { UnitSettings } from "./UnitSettings";
import { ExportShareSection } from "./ExportShareSection";
import { CarExportShareSection } from "./CarExportShareSection";
import { RecentActivity, type RecentActivityItem } from "./RecentActivity";
import { DashboardShell } from "./DashboardShell";
import { NotificationBell } from "./NotificationBell";
import { QuoteForm } from "@/components/QuoteForm";
import { CostCalculatorForm } from "@/components/CostCalculatorForm";
import { BuyingGuideForm } from "@/components/BuyingGuideForm";
import { PrivacyContent } from "../privacy/PrivacyContent";
import { TransferOwnershipSection } from "./TransferOwnershipSection";
import { IncomingOwnershipRequestCard } from "./IncomingOwnershipRequestCard";
import { getPendingTransferRequestsForOwner } from "@/lib/tracker/bikeTransferRequest";
import { CarTransferOwnershipSection } from "./CarTransferOwnershipSection";
import { IncomingCarOwnershipRequestCard } from "./IncomingCarOwnershipRequestCard";
import { getPendingCarTransferRequestsForOwner } from "@/lib/tracker/carTransferRequest";
import { getSellerReportCore } from "@/lib/tracker/sellerReportData";
import { buildWalkAwayIssues } from "@/lib/tracker/walkAwayRisks";
import { buildSellerPrepIssues, buildSellerPrepPlan } from "@/lib/tracker/sellerPrep";
import { StorySoFarTab } from "./StorySoFarTab";
import { getCarSellerReportCore } from "@/lib/tracker/carSellerReportData";
import { buildCarWalkAwayIssues } from "@/lib/tracker/carWalkAwayRisks";
import { CarStorySoFarTab } from "./CarStorySoFarTab";
import { ChartFilterProvider } from "./ChartFilterContext";
import { ChartFilterBar } from "./ChartFilterBar";
import { DashboardStatCards } from "./DashboardStatCards";
import { CustomFilterPanel } from "./CustomFilterPanel";
import { ScanReceiptButton } from "./ScanReceiptButton";
import { RegistrationBackfillBanner } from "./RegistrationBackfillBanner";
import { Icon } from "./Icon";
import { LockedStatCard } from "./LockedStatCard";
import { getProStatus } from "@/lib/subscriptions";
import { ProGate } from "./ProGate";
import { PlanComparisonCards } from "@/components/PlanComparisonCards";
import { isTwoFactorEnabled } from "@/lib/auth/twoFactor";
import { SettingsTab } from "./SettingsTab";
import { getUserDoc } from "@/lib/tracker/userDoc";
import { getPendingDeletionInfo } from "@/lib/tracker/userAccount";

// --- Car support (see RoadVerdict_Car_Plan_v3.md's ADR) ---
import { resolveActiveVehicle } from "@/lib/tracker/activeVehicle";
import { getCarsForUser, pickActiveCar, getCurrentRegistration as getCarCurrentRegistration, isCarReadOnly, type CarDoc } from "@/lib/tracker/car";
import { getCarServiceRecords } from "@/lib/tracker/carServiceRecord";
import { getCarFuelLogs } from "@/lib/tracker/carFuelLog";
import { getCarMods } from "@/lib/tracker/carMod";
import { getCarBills } from "@/lib/tracker/carBill";
import { getCarLabour } from "@/lib/tracker/carLabour";
import { CAR_LABOUR_LABELS } from "@/lib/tracker/carLabourTypes";
import { getCarReminders } from "@/lib/tracker/carReminder";
import { computeCarReminderStatus } from "@/lib/tracker/carReminderStatus";
import { computeCarSpendSummary, computeCarYearSpend, gatherCarMileagePoints } from "@/lib/tracker/carSummary";
import { CAR_JOB_LABELS } from "@/lib/tracker/carJobTypes";
import { CAR_BILL_LABELS } from "@/lib/tracker/carBillTypes";
// Aliased, not re-imported under its own name - fuelLog.ts (bike-only)
// already imports the same function from mpgCalc.ts above for the bike
// path; this is a second, separate import of the same neutral function
// for the car path, kept under its own name so neither path visibly
// crosses into the other's file, matching the sister-schema convention
// everywhere else in this file.
import { computeMPGSeries as computeCarMpgSeries } from "@/lib/tracker/mpgCalc";
import { AddCarForm } from "./AddCarForm";
import { LogCarServiceForm } from "./LogCarServiceForm";
import { LogCarFuelForm } from "./LogCarFuelForm";
import { LogCarModForm } from "./LogCarModForm";
import { LogCarBillForm } from "./LogCarBillForm";
import { LogCarLabourForm } from "./LogCarLabourForm";
import { CarServiceHistoryCard } from "./CarServiceHistoryCard";
import { CarFuelLogCard } from "./CarFuelLogCard";
import { CarModCard } from "./CarModCard";
import { CarBillCard } from "./CarBillCard";
import { CarExcludeFromReportToggle } from "./CarExcludeFromReportToggle";
import { CarLabourCard } from "./CarLabourCard";
import { CarReminderItem } from "./CarReminderItem";
import { CarCustomFilterPanel } from "./CarCustomFilterPanel";
import { CarQuoteForm } from "@/components/CarQuoteForm";
import { CarCostCalculatorForm } from "@/components/CarCostCalculatorForm";
import { CarBuyingGuideForm } from "@/components/CarBuyingGuideForm";
import { CAR_BRAND_OPTIONS, slugifyCarMake, type CarBenchmarkClass } from "@/lib/carPriceData";

// Duplicated from src/app/cars/quote-checker/page.tsx and
// cost-calculator/page.tsx (which don't share it with each other
// either) - each of the three car tool entry points computing this
// independently is the existing convention, not something new here.
function classFromEngineLitres(engineLitres: number): CarBenchmarkClass {
  if (engineLitres <= 1.2) return "small";
  if (engineLitres <= 2.0) return "medium";
  return "large";
}

export const dynamic = "force-dynamic";

export default async function DashboardPage(props: { searchParams: Promise<{ addVehicle?: string }> }) {
  const searchParams = await props.searchParams;
  const session = await getSession();
  if (!session) redirect("/login");

  // Account-level, not bike/car-specific - fetched once here so it's
  // available before the car/bike branch decision below, and passed
  // into renderCarDashboard rather than re-fetched there.
  const userAccount = await getUserDoc(session.email);
  const pendingDeletion = getPendingDeletionInfo(userAccount);

  // Resolves which vehicle KIND is active (see activeVehicle.ts) -
  // checked before any bike-specific fetch below, so a car-active
  // session branches off entirely rather than falling through into
  // logic that assumes a bike exists. Duplicates the getBikesForUser
  // call made a few lines below (resolveActiveVehicle does its own
  // internal fetch) - same accepted-duplication reasoning as
  // getSellerReportCore further down this same file: one page load per
  // visit for one signed-in person, not a hot path worth extra
  // complexity to avoid.
  const activeVehicle = await resolveActiveVehicle(session.email);
  const existingCars = await getCarsForUser(session.email);

  // Reached from the homepage's/cars marketing page's "Start logging
  // your car"/"Start logging your motorcycle" buttons - see page.tsx and
  // cars/page.tsx. Only shown when the account genuinely has no car yet;
  // once one exists, this same URL (which a POST's router.refresh()
  // would revisit, still carrying the query param) correctly falls
  // through instead of re-showing the form.
  if (searchParams.addVehicle === "car" && existingCars.length === 0) {
    return (
      <main className={styles.main}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
          <LogoutButton />
        </div>
        <h1 className={styles.heading}>Add your car</h1>
        <p className={styles.subtext}>Signed in as {session.email}.</p>
        <AddCarForm />
      </main>
    );
  }

  // addVehicle forces which kind renders below, overriding whatever the
  // activeVehicleKind cookie remembers - without this, an account that
  // holds both a bike and a car but last viewed its bike would silently
  // stay on the bike dashboard after clicking "Start logging your car"
  // (or the /cars page's "Go to your dashboard"), since the cookie-driven
  // resolveActiveVehicle() has no idea a specific kind was just
  // requested. addVehicle=bike needs no equivalent car-side branch above:
  // forcing effectiveKind away from "car" here just falls through to the
  // existing bike-fetch code below, which already renders AddBikeForm
  // for an account with no bike yet, exactly like the car case does.
  const effectiveKind: "bike" | "car" | null =
    searchParams.addVehicle === "bike" ? "bike"
    : searchParams.addVehicle === "car" ? "car"
    : activeVehicle?.kind ?? null;

  if (effectiveKind === "car") {
    // Already resolved to "car" the ordinary way - reuse it as-is.
    if (activeVehicle?.kind === "car") {
      return renderCarDashboard(session.email, activeVehicle.car, existingCars, activeVehicle.hasAnyBike, userAccount, pendingDeletion);
    }
    // Forced past a cookie that resolved to "bike" (or no cookie at all
    // for an account with both, defaulting to bike) - existingCars.length
    // > 0 is guaranteed here, since the addVehicle==="car" branch above
    // already returned for the zero-cars case. activeVehicle?.kind ===
    // "bike" is what got us here, which itself guarantees bikes exist.
    const forcedCar = await pickActiveCar(existingCars);
    if (forcedCar) {
      return renderCarDashboard(session.email, forcedCar, existingCars, true, userAccount, pendingDeletion);
    }
  }

  const bikes = await getBikesForUser(session.email);
  const bike = await pickActiveBike(bikes);
  const shareLinks = await getShareLinksForUser(session.email);
  const proStatus = await getProStatus(session.email);
  const userIsPro = proStatus.isPro;
  const pendingReceiptRequests = await getPendingReceiptRequestsForOwner(session.email);
  const bikeNames: Record<string, string> = {};
  for (const b of bikes) {
    bikeNames[b.id] = b.nickname ? `${b.nickname} (${b.make} ${b.model})` : `${b.make} ${b.model}`;
  }

  if (!bike) {
    return (
      <main className={styles.main}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
          <LogoutButton />
        </div>
        <h1 className={styles.heading}>Add your bike</h1>
        <p className={styles.subtext}>Signed in as {session.email}.</p>
        <AddBikeForm />
      </main>
    );
  }

  if (!bike.region) {
    return (
      <main className={styles.main}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
          <LogoutButton />
        </div>
        <h1 className={styles.heading}>
          {bike.nickname ? `${bike.nickname} - ${bike.make} ${bike.model}` : `${bike.make} ${bike.model}`}
        </h1>
        <SetRegionForm />
      </main>
    );
  }

  const distanceUnit: DistanceUnit = bike.distanceUnit ?? "mi";
  const fuelEconomyUnit: FuelEconomyUnit = bike.fuelEconomyUnit ?? "mpg";
  const currency: Currency = bike.currency ?? "GBP";

  // Lazy materialisation - writes any instalment plan's due payments as
  // real bills before they're read below, rather than relying on a cron
  // that doesn't exist. Must run before getBills, not in parallel with
  // it, since it's what a fresh dashboard load depends on being current.
  // Skipped for a transferred (read-only) bike - once sold, its previous
  // owner's frozen copy shouldn't keep growing new insurance payments
  // for a bike they no longer own.
  if (!isBikeReadOnly(bike)) {
    await materializeAllDueForBike(session.email, bike.id);
  }

  const [records, fuelLogs, mods, bills, labour, billSeries, reminders, rates] = await Promise.all([
    getServiceRecords(session.email, bike.id),
    getFuelLogs(session.email, bike.id),
    getMods(session.email, bike.id),
    getBills(session.email, bike.id),
    getLabour(session.email, bike.id),
    getBillSeriesForBike(session.email, bike.id),
    getReminders(session.email, bike.id),
    getExchangeRates(),
  ]);
  const brandValue = slugifyMake(bike.make);
  const pendingReviewIds = {
    service: records.filter((r) => r.needsReview).map((r) => r.id),
    fuel: fuelLogs.filter((f) => f.needsReview).map((f) => f.id),
    mods: mods.filter((m) => m.needsReview).map((m) => m.id),
    bills: bills.filter((b) => b.needsReview).map((b) => b.id),
    labour: labour.filter((l) => l.needsReview).map((l) => l.id),
  };
  const actualMpg = computeActualMPG(fuelLogs, bike.dvlaData?.officialCombinedMpg);
  const mpgSeries = computeMPGSeries(fuelLogs, bike.dvlaData?.officialCombinedMpg);
  const mileagePoints = gatherMileagePoints(records, mods, fuelLogs, bills, labour);
  const fuelCostPoints = fuelLogs.map((f) => ({ id: f.id, date: f.date, cost: f.cost, mileage: f.mileage }));
  const summary = computeSpendSummary(records, mods, fuelLogs, bills, labour);
  const currentYear = new Date().getFullYear();
  const yearSpend = computeYearSpend(records, mods, fuelLogs, bills, currentYear, labour);
  const overBudget = bike.annualBudget != null && yearSpend >= bike.annualBudget;

  const recentActivity: RecentActivityItem[] = [
    ...records.map((r) => ({
      id: r.id, reviewCategory: "service" as const,
      date: r.date, icon: "🔧", type: "Service",
      description: JOB_LABELS[r.jobType] ?? r.jobType,
      category: "Servicing & repairs", cost: r.cost, mileage: r.mileage,
    })),
    ...fuelLogs.map((f) => ({
      id: f.id, reviewCategory: "fuel" as const,
      date: f.date, icon: "⛽", type: "Fuel",
      description: `${f.litres.toFixed(1)}L${f.filledToFull ? " (full)" : ""}`,
      category: "Fuel", cost: f.cost, mileage: f.mileage,
    })),
    ...mods.map((m) => ({
      id: m.id, reviewCategory: "mods" as const,
      date: m.date, icon: "⚙", type: "Part",
      description: m.name, category: "Parts & Accessories", cost: m.cost, mileage: m.mileage,
    })),
    ...bills.map((b) => ({
      id: b.id, reviewCategory: "bills" as const,
      date: b.date, icon: "📄", type: "Bill",
      description: BILL_LABELS[b.billType] ?? b.billType,
      category: "Insurance/tax/MOT/finance", cost: b.cost,
    })),
    ...labour.map((l) => ({
      id: l.id, reviewCategory: "labour" as const,
      date: l.date, icon: "🔨", type: "Labour",
      description: LABOUR_LABELS[l.category] ?? l.category,
      category: "Labour", cost: l.cost, mileage: l.mileage,
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);

  const bikeName = bike.nickname ? `${bike.nickname} - ${bike.make} ${bike.model}` : `${bike.make} ${bike.model}`;
  const currentRegistration = getCurrentRegistration(bike);
  // Same tag shown next to every tab's page title, not just Dashboard -
  // built once here so all eight headers (plus Story So Far and
  // Shareable Links, which render it themselves from the props passed
  // below) stay in sync rather than drifting from copy-pasted markup.
  const bikeTag = (bike.nickname || currentRegistration) ? (
    <span className={styles.headingBikeTag}>
      {bike.nickname}
      {bike.nickname && currentRegistration && " · "}
      {currentRegistration}
    </span>
  ) : null;
  // Same pill (now with the notification bell alongside it) shown next
  // to every tab's page title, not just Dashboard - built once here for
  // the same reuse reason as bikeTag above. Story So Far and Shareable
  // Links build their own copy from the plain currentMileage/
  // distanceUnit props passed below, matching how they already build
  // their own bikeTag rather than receiving JSX directly - so the bell
  // is not yet present on those two tabs' own headers, only wherever
  // this shared variable itself is used directly.
  const mileagePill = (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
      <NotificationBell />
      <div className={styles.headerMileagePill}>
        <Icon name="currentMiles" size={15} />
        {Math.round(convertMilesToDisplay(bike.currentMileage, distanceUnit)).toLocaleString()} {distanceUnit === "km" ? "km" : "mi"}
      </div>
    </div>
  );

  const dashboardContent = (
    <ChartFilterProvider>
      {!bike.originalRegistration && (
        <RegistrationBackfillBanner bikeName={bike.nickname ? `${bike.nickname} (${bike.make} ${bike.model})` : `${bike.make} ${bike.model}`} />
      )}
      {overBudget && (
        <div className={styles.budgetWarningBanner}>
          ⚠ <strong>You&apos;re over your {currentYear} budget</strong> - {formatCurrency(yearSpend, currency, rates)} spent against a{" "}
          {formatCurrency(bike.annualBudget as number, currency, rates)} budget, {formatCurrency(yearSpend - (bike.annualBudget as number), currency, rates)} over.
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>
          Dashboard
          {bikeTag}
        </h1>
        {mileagePill}
      </div>
      <p className={styles.subtext} style={{ marginBottom: "1rem" }}>Here&apos;s how your bike looks today.</p>

      {bike.dvlaData?.euroStatus && (() => {
        // Motorcycles need Euro 3 or above for London's ULEZ - a much
        // lower bar than cars (Euro 4 petrol / Euro 6 diesel). Parses
        // leading digits from values like "5", "5b", "6b". TfL's own
        // checker is the definitive source - this is a heads-up, not a
        // guarantee, hence the link out rather than a flat yes/no claim.
        const euroNumber = parseInt(bike.dvlaData.euroStatus, 10);
        if (Number.isNaN(euroNumber)) return null;
        const likelyCompliant = euroNumber >= 3;
        return (
          <p className={styles.subtext} style={{ marginBottom: "1rem" }}>
            Euro {bike.dvlaData.euroStatus} emissions standard - {likelyCompliant ? "likely compliant with London's ULEZ" : "likely does NOT meet London's ULEZ requirement (Euro 3+)"}.{" "}
            <a href="https://tfl.gov.uk/modes/driving/check-your-vehicle/" target="_blank" rel="noopener">Check definitively on TfL&apos;s own site ↗</a>
          </p>
        );
      })()}

      {(() => {
        const specParts: string[] = [];
        if (bike.dvlaData?.powerBhp) {
          specParts.push(`${bike.dvlaData.powerBhp}bhp${bike.dvlaData.powerRpm ? ` @ ${bike.dvlaData.powerRpm}rpm` : ''}`);
        }
        if (bike.dvlaData?.torqueNm) {
          specParts.push(`${bike.dvlaData.torqueNm}Nm torque`);
        }
        if (bike.dvlaData?.countryOfOrigin) {
          specParts.push(`Made in ${bike.dvlaData.countryOfOrigin}`);
        }
        return specParts.length > 0 ? (
          <p className={styles.subtext} style={{ marginBottom: "1rem" }}>{specParts.join(' · ')}</p>
        ) : null;
      })()}

      <ScanReceiptButton isPro={userIsPro} />

      <ChartFilterBar />

      <div style={{ marginBottom: "1rem" }}>
        <UnitSettings distanceUnit={distanceUnit} fuelEconomyUnit={fuelEconomyUnit} currency={currency} />
      </div>

      <div className={styles.dashboardStatsGrid}>
        <DashboardStatCards
          records={records}
          mods={mods}
          bills={bills}
          labour={labour}
          fuelLogs={fuelLogs}
          currentMileage={bike.currentMileage}
          startingMileage={bike.startingMileage}
          currency={currency}
          rates={rates}
          distanceUnit={distanceUnit}
          fuelEconomyUnit={fuelEconomyUnit}
          isPro={userIsPro}
        />
        <div className={styles.statCard}>
          <div className={`${styles.statCardIcon} ${styles.statCardIconNeutral}`}>
            <Icon name="currentMiles" size={16} />
          </div>
          <div className={styles.statCardValue}>{Math.round(convertMilesToDisplay(bike.currentMileage, distanceUnit)).toLocaleString()}</div>
          <div className={styles.statCardLabel}>Current {distanceUnit === "km" ? "km" : "miles"}</div>
        </div>
        {userIsPro ? (
          <div className={styles.statCard}>
            <div className={`${styles.statCardIcon} ${styles.statCardIconNeutral}`}>
              <Icon name="spendThisYear" size={16} />
            </div>
            <div className={styles.statCardValue}>{formatCurrency(yearSpend, currency, rates)}</div>
            <div className={styles.statCardLabel}>Spend this year</div>
          </div>
        ) : (
          <LockedStatCard icon="spendThisYear" iconClass={styles.statCardIconNeutral} label="Spend this year" />
        )}
      </div>

      <div className={`${styles.dashboardTwoCol} ${styles.equalHeightRow}`}>
        <BudgetWidget yearSpend={yearSpend} currentYear={currentYear} initialBudget={bike.annualBudget} currency={currency} rates={rates} />
        <div className={styles.chartCard}>
          {summary.grandTotal > 0 ? (
            <SpendDonutChart records={records} mods={mods} fuelLogs={fuelLogs} bills={bills} labour={labour} currency={currency} rates={rates} initialChartType={bike.chartTypes?.["spend-donut"] === "bar" ? "bar" : "pie"} isPro={userIsPro} />
          ) : (
            <>
              <div className={styles.chartCardTitle}>Spend by category</div>
              <p className={styles.emptyNote}>Log something to see this fill in.</p>
            </>
          )}
        </div>
      </div>

      <div className={styles.dashboardTwoCol}>
        <div className={styles.chartCard}>
          {mileagePoints.length > 0 ? (
            <MileageChart points={mileagePoints} distanceUnit={distanceUnit} initialChartType={bike.chartTypes?.["mileage"] === "bar" ? "bar" : "line"} />
          ) : (
            <>
              <div className={styles.chartCardTitle}>{distanceUnit === "km" ? "Kilometres" : "Mileage"} over time</div>
              <p className={styles.emptyNote}>Log a couple of entries to see your mileage build up.</p>
            </>
          )}
        </div>
        <div className={styles.chartCard}>
          <div className={styles.chartCardTitle}>Recent activity</div>
          <RecentActivity items={recentActivity} distanceUnit={distanceUnit} currency={currency} rates={rates} />
        </div>
      </div>

      <ExportShareSection isPro={userIsPro} />
    </ChartFilterProvider>
  );

  const serviceContent = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>Service{bikeTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext}>Every oil change, every brake job - a real maintenance record, not a hazy memory of &quot;I think I did it.&quot;</p>
      <LogServiceForm initialMileage={bike.currentMileage} mileageHistory={mileagePoints} startingMileage={bike.startingMileage} dateAdded={bike.dateAdded} distanceUnit={distanceUnit} currency={currency} rates={rates} bikeYear={bike.year} isCustomBuild={bike.isCustomBuild} />
      <h2 className={styles.sectionHeading}>Service history</h2>
      {records.length === 0 ? (
        <div className={styles.card}><p className={styles.cardBody}>No service records logged yet. Log your first one above.</p></div>
      ) : (
        records.map((r) => (
          <ServiceHistoryCard key={r.id} record={r} bikeClass={bike.bikeClass} brandValue={brandValue} region={bike.region as Region} distanceUnit={distanceUnit} currency={currency} rates={rates} pendingReviewIds={pendingReviewIds} mileageHistory={mileagePoints} currentMileage={bike.currentMileage} />
        ))
      )}
    </>
  );

  const fuelContent = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>Fuel{bikeTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext}>Log a fill-up in seconds, and watch your actual mpg emerge - not the manufacturer&apos;s claim, yours.</p>
      <LogFuelForm initialMileage={bike.currentMileage} mileageHistory={mileagePoints} startingMileage={bike.startingMileage} dateAdded={bike.dateAdded} distanceUnit={distanceUnit} currency={currency} rates={rates} bikeYear={bike.year} isCustomBuild={bike.isCustomBuild} />
      {actualMpg ? (
        <p className={styles.subtext} style={{ marginBottom: "0.9rem" }}>
          Your actual average from logged fill-ups: <strong>{formatFuelEconomy(actualMpg, fuelEconomyUnit)}</strong>{" "}
          {bike.dvlaData?.officialCombinedMpg ? (
            <>(the manufacturer&apos;s official combined figure for this exact bike is{" "}
            {fuelEconomyUnit === "l100km"
              ? `${(282.481 / bike.dvlaData.officialCombinedMpg).toFixed(1)} L/100km`
              : `${bike.dvlaData.officialCombinedMpg} mpg`}{" "}
            - this is your own real-world average, riding your own roads).</>
          ) : (
            <>(the Cost Calculator assumes 57 mpg generally - this is specific to your bike and riding).</>
          )}
        </p>
      ) : (
        <p className={styles.subtext} style={{ marginBottom: "0.9rem" }}>Log at least two consecutive full-tank fill-ups to see your bike&apos;s real fuel economy here.</p>
      )}
      <h2 className={styles.sectionHeading}>Fuel log</h2>
      {fuelLogs.length === 0 ? (
        <div className={styles.card}><p className={styles.cardBody}>No fuel fill-ups logged yet. Log your first one above.</p></div>
      ) : (
        fuelLogs.map((f) => <FuelLogCard key={f.id} log={f} distanceUnit={distanceUnit} currency={currency} rates={rates} pendingReviewIds={pendingReviewIds} mileageHistory={mileagePoints} currentMileage={bike.currentMileage} />)
      )}
    </>
  );

  const modsContent = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>Parts & Accessories{bikeTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext}>Every upgrade, with the receipt to prove it wasn&apos;t a bodge job.</p>
      <LogModForm initialMileage={bike.currentMileage} mileageHistory={mileagePoints} startingMileage={bike.startingMileage} dateAdded={bike.dateAdded} distanceUnit={distanceUnit} currency={currency} rates={rates} bikeYear={bike.year} isCustomBuild={bike.isCustomBuild} />
      <h2 className={styles.sectionHeading}>History</h2>
      {mods.length === 0 ? (
        <div className={styles.card}><p className={styles.cardBody}>No modifications or accessories logged yet.</p></div>
      ) : (
        mods.map((m) => <ModCard key={m.id} mod={m} distanceUnit={distanceUnit} currency={currency} rates={rates} pendingReviewIds={pendingReviewIds} mileageHistory={mileagePoints} currentMileage={bike.currentMileage} />)
      )}
    </>
  );

  const billsContent = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>Insurance, Tax, MOT &amp; Finance{bikeTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext}>The paperwork you genuinely can&apos;t afford to forget, tracked in one place, automatically.</p>
      <LogBillForm currency={currency} rates={rates} bikeYear={bike.year} isCustomBuild={bike.isCustomBuild} />
      {billSeries.length > 0 && <BillSeriesSummary series={billSeries} currency={currency} rates={rates} />}
      <ExcludeFromReportToggle
        fieldName="includeInsuranceInReport"
        included={Boolean(bike.includeInsuranceInReport)}
        checkboxLabel="Show insurance history in my buyer report"
        confirmMessage="A future buyer will have their own insurance costs - showing yours could make your bike look pricier to run than it will actually be for them. Show anyway?"
        noteText="Off by default - insurance depends on who's holding the policy, not the bike, so a future buyer's own premium will be different regardless of what you've paid. Road tax and MOT are always shown, since those are tied to the bike itself."
      />
      <ExcludeFromReportToggle
        fieldName="includeFinanceInReport"
        included={Boolean(bike.includeFinanceInReport)}
        checkboxLabel="Show finance history in my buyer report"
        confirmMessage="A future buyer would have their own finance agreement, or none at all - showing yours could make your bike look pricier to run than it will actually be for them. Show anyway?"
        noteText="Off by default - a finance agreement is personal to whoever took it out, not the bike, so a future buyer's own deal (if they have one) will be completely different. Road tax and MOT are always shown, since those are tied to the bike itself."
      />
      <h2 className={styles.sectionHeading}>History</h2>
      {bills.length === 0 ? (
        <div className={styles.card}><p className={styles.cardBody}>No insurance, tax, MOT, or finance payments logged yet.</p></div>
      ) : (
        bills.map((b) => (
          <BillCard
            key={b.id}
            bill={b}
            currency={currency}
            rates={rates}
            pendingReviewIds={pendingReviewIds}
            distanceUnit={distanceUnit}
            includeInsuranceInReport={Boolean(bike.includeInsuranceInReport)}
            includeFinanceInReport={Boolean(bike.includeFinanceInReport)}
          />
        ))
      )}
    </>
  );

  const labourContent = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>Labour{bikeTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext}>Workshop time and diagnostic hours - the part of the bill that&apos;s easy to forget once the parts themselves are paid for.</p>
      <LogLabourForm initialMileage={bike.currentMileage} mileageHistory={mileagePoints} startingMileage={bike.startingMileage} dateAdded={bike.dateAdded} distanceUnit={distanceUnit} currency={currency} rates={rates} bikeYear={bike.year} isCustomBuild={bike.isCustomBuild} />
      <h2 className={styles.sectionHeading}>History</h2>
      {labour.length === 0 ? (
        <div className={styles.card}><p className={styles.cardBody}>No labour logged yet.</p></div>
      ) : (
        labour.map((l) => <LabourCard key={l.id} labour={l} distanceUnit={distanceUnit} currency={currency} rates={rates} pendingReviewIds={pendingReviewIds} mileageHistory={mileagePoints} currentMileage={bike.currentMileage} />)
      )}
    </>
  );

  const remindersContent = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>Reminders{bikeTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext}>RoadVerdict remembers so you don&apos;t have to. Nothing missed, nothing lapsed.</p>
      {!userIsPro && (
        <>
          <p className={styles.subtext} style={{ marginBottom: "1rem" }}>
            <Icon name="lock" size={13} /> Free plan: every reminder is tracked here with its OK/Overdue status, but the exact due date/mileage is Premium, and we won&apos;t email or notify you automatically when one&apos;s due - check back here.
          </p>
          <div className={styles.proGateUnlockNote} style={{ marginBottom: "1rem" }}>
            One Pro subscription unlocks exact reminder dates and every other locked feature across RoadVerdict together, not just this one.
          </div>
          <PlanComparisonCards userIsPro={false} showFreeCta={false} />
        </>
      )}
      {reminders.length === 0 ? (
        <div className={styles.card}><p className={styles.cardBody}>No reminders set yet. Tick &quot;Remind me&quot; when logging a service or a bill to add one.</p></div>
      ) : (
        reminders.map((r) => <ReminderItem key={r.id} reminder={r} status={computeReminderStatus(r, bike.currentMileage)} isPro={userIsPro} />)
      )}
    </>
  );

  const reportsContent = (
    <ProGate featureName="Reports" description="Every chart in one place - fuel economy, running costs, and category spend trends over the life of your bike." isPro={userIsPro}>
    <ChartFilterProvider>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>Reports{bikeTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext}>Every chart in one place - see where the money&apos;s really going, and whether your bike&apos;s getting thirstier with age.</p>
      <p className={styles.subtext} style={{ marginBottom: "1rem" }}>Every chart in one place.</p>
      <ChartFilterBar />
      <div className={styles.reportsGrid}>
        <div className={styles.chartCard}>
          {mpgSeries.length > 0 ? (
            <MpgChart
              series={mpgSeries}
              fuelEconomyUnit={fuelEconomyUnit}
              distanceUnit={distanceUnit}
              initialChartType={bike.chartTypes?.["mpg"] === "bar" ? "bar" : "line"}
              currency={currency}
              rates={rates}
              excludedFuelEntries={fuelLogs
                .filter((f) => f.mileageConfidence === "estimated" || f.mileageConfidence === "interpolated")
                .map((f) => ({ date: f.date, cost: f.cost }))}
            />
          ) : (
            <>
              <div className={styles.chartCardTitle}>{fuelEconomyUnit === "l100km" ? "Fuel economy" : "MPG"} over time</div>
              <p className={styles.emptyNote}>Log two consecutive full-tank fill-ups to see this.</p>
            </>
          )}
        </div>
        <div className={styles.chartCard}>
          {fuelCostPoints.length > 0 ? (
            <FuelCostChart points={fuelCostPoints} currency={currency} rates={rates} distanceUnit={distanceUnit} initialChartType={bike.chartTypes?.["fuel-cost"] === "bar" ? "bar" : "line"} />
          ) : (
            <>
              <div className={styles.chartCardTitle}>Fuel cost over time</div>
              <p className={styles.emptyNote}>Log a fuel fill-up to see cost trends here.</p>
            </>
          )}
        </div>
        <div className={styles.chartCard}>
          {records.length > 0 ? (
            <CategorySpendChart chartId="servicing-spend" title="Servicing spend over time" items={records} category="service" color="#1C1D20" currency={currency} rates={rates} distanceUnit={distanceUnit} initialChartType={bike.chartTypes?.["servicing-spend"] === "line" ? "line" : "bar"} />
          ) : (
            <>
              <div className={styles.chartCardTitle}>Servicing spend over time</div>
              <p className={styles.emptyNote}>No servicing logged yet.</p>
            </>
          )}
        </div>
        <div className={styles.chartCard}>
          {mods.length > 0 ? (
            <CategorySpendChart chartId="mods-spend" title="Parts & Accessories spend over time" items={mods} category="mods" color="#EE9A2E" currency={currency} rates={rates} distanceUnit={distanceUnit} initialChartType={bike.chartTypes?.["mods-spend"] === "line" ? "line" : "bar"} />
          ) : (
            <>
              <div className={styles.chartCardTitle}>Parts & Accessories spend over time</div>
              <p className={styles.emptyNote}>No modifications logged yet.</p>
            </>
          )}
        </div>
        <div className={styles.chartCard}>
          {bills.length > 0 ? (
            <CategorySpendChart chartId="bills-spend" title="Insurance, tax, MOT & finance spend over time" items={bills} category="bills" color="#8A867D" currency={currency} rates={rates} distanceUnit={distanceUnit} supportsMileageView={false} initialChartType={bike.chartTypes?.["bills-spend"] === "line" ? "line" : "bar"} />
          ) : (
            <>
              <div className={styles.chartCardTitle}>Insurance, tax, MOT & finance spend over time</div>
              <p className={styles.emptyNote}>No insurance, tax, or MOT payments logged yet.</p>
            </>
          )}
        </div>
        <div className={styles.chartCard}>
          {labour.length > 0 ? (
            <CategorySpendChart chartId="labour-spend" title="Labour spend over time" items={labour} category="labour" color="#3E6B99" currency={currency} rates={rates} distanceUnit={distanceUnit} initialChartType={bike.chartTypes?.["labour-spend"] === "line" ? "line" : "bar"} />
          ) : (
            <>
              <div className={styles.chartCardTitle}>Labour spend over time</div>
              <p className={styles.emptyNote}>No labour logged yet.</p>
            </>
          )}
        </div>
        <CustomFilterPanel records={records} mods={mods} bills={bills} fuelLogs={fuelLogs} currency={currency} rates={rates} fuelEconomyUnit={fuelEconomyUnit} />
      </div>
    </ChartFilterProvider>
    </ProGate>
  );

  const pendingTransferRequests = await getPendingTransferRequestsForOwner(session.email);
  const requestsForThisBike = pendingTransferRequests.filter((r) => r.bikeId === bike.id);
  const outgoingOffer = requestsForThisBike.find((r) => r.initiatedBy === "owner");
  const incomingRequest = requestsForThisBike.find((r) => r.initiatedBy === "recipient");

  const shareLinksContent = (
    <ShareLinksSection isPro={userIsPro}
      links={shareLinks}
      bikeNames={bikeNames}
      appUrl={process.env.APP_URL ?? "https://roadverdict.co.uk"}
      requests={pendingReceiptRequests}
      bikeNickname={bike.nickname}
      registration={currentRegistration}
      currentMileage={bike.currentMileage}
      distanceUnit={distanceUnit}
    />
  );

  const transferOwnershipContent = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>Transfer ownership{bikeTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext}>Selling this bike? Hand the buyer your logged history instead of them starting fresh.</p>
      {incomingRequest && (
        <IncomingOwnershipRequestCard
          requestId={incomingRequest.id}
          requesterEmail={incomingRequest.recipientEmail}
          createdAt={incomingRequest.createdAt}
        />
      )}
      <TransferOwnershipSection
        pendingRequest={outgoingOffer ? { recipientEmail: outgoingOffer.recipientEmail, createdAt: outgoingOffer.createdAt, includeRecords: outgoingOffer.includeRecords } : null}
        bikeIsReadOnly={isBikeReadOnly(bike)}
      />
    </>
  );

  // Car entries aren't merged in here yet - this page's own data-fetching
  // and every tab's content below are still entirely BikeDoc-based (see
  // the ADR: rendering real car dashboard content - forms, history tabs -
  // is separate, not-yet-built work). The switcher, DashboardShell's
  // vehicle-kind branching, and the full car API layer are ready for it;
  // wiring an active car into this specific function is the next step.
  const switcherVehicles = bikes.map((b) => ({
    id: b.id,
    kind: 'bike' as const,
    name: b.nickname ? `${b.nickname} - ${b.make} ${b.model}` : `${b.make} ${b.model}`,
    year: b.year,
    currentMileage: b.currentMileage,
  }));

  // Pre-population for the three embedded tools below - always signed
  // in here (this is the dashboard), so unlike the standalone pages
  // there's no need to branch on session state, just reuse the same
  // matching logic. brandValue is already computed above for other
  // purposes; validated fresh here since this specific use needs the
  // 'other' fallback for a brand the curated list doesn't have.
  const toolInitialBrand = BRAND_OPTIONS.some((b) => b.value === brandValue) ? brandValue : "other";
  const toolInitialModel = getModelsForBrand(toolInitialBrand).find(
    (m) => m.model.toLowerCase().includes(bike.model.toLowerCase()) || bike.model.toLowerCase().includes(m.model.toLowerCase())
  )?.model;
  const toolInitialBikeClass = getBikeClassForCC(bike.engineCC);

  // Same cooldown window as story-so-far/route.ts - duplicated as a
  // plain constant since a route handler isn't a regular importable
  // module, but this must stay in sync with that file's own COOLDOWN_MS.
  const STORY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
  const initialStory = bike.storyCache
    ? {
        generatedWithAi: bike.storyCache.response.generatedWithAi,
        sharedStory: bike.storyCache.response.sharedStory,
        ownerNotes: bike.storyCache.response.ownerNotes,
        verdict: bike.storyCache.response.verdict,
        generatedAt: bike.storyCache.generatedAt,
        cached: true,
        nextAvailableAt: new Date(new Date(bike.storyCache.generatedAt).getTime() + STORY_COOLDOWN_MS).toISOString(),
      }
    : null;

  // The exact same core the buyer report and Story So Far's own API
  // route are already built from (see sellerReportData.ts) - not a
  // second, separately-derived version that could drift from what a
  // buyer eventually sees. Re-fetches records/mods/bills/fuelLogs/
  // reminders internally, a small, accepted duplicate of what's
  // already fetched above for the other tabs - this page loads once
  // per visit for one signed-in person, not a hot path worth the
  // complexity of avoiding.
  const sellerCore = await getSellerReportCore(session.email, bike.id);
  const storyReady = sellerCore.verdict.tier !== "limited-documentation";
  const sellerWalkAwayIssues = buildWalkAwayIssues(bike, sellerCore.mileageCheck, sellerCore.evidenceQuality);
  const sellerPrep = {
    evidenceQuality: sellerCore.evidenceQuality,
    prepIssues: buildSellerPrepIssues(sellerWalkAwayIssues),
    upcomingCostItems: sellerCore.upcomingCostItems,
    likelyQuestions: sellerCore.detailedQuestions,
    prepPlan: buildSellerPrepPlan(
      sellerCore.evidenceQuality.receiptCoveragePct,
      sellerWalkAwayIssues.length,
      sellerCore.upcomingCostItems.filter((i) => i.timing === "overdue").length,
      sellerCore.detailedQuestions.length
    ),
  };

  const quoteCheckerContent = (
    <ProGate featureName="Quote Checker" description="Check whether a quote you've been given is fair, benchmarked against real UK motorcycle service and repair prices." isPro={userIsPro}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>Quote Checker{bikeTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext}>Three quick questions. One honest answer, benchmarked against typical UK prices.</p>
      <QuoteForm signedIn initialBrand={toolInitialBrand} initialBikeClass={toolInitialBikeClass} />
    </ProGate>
  );

  const costCalculatorContent = (
    <ProGate featureName="Cost Calculator" description="Work out what a bike really costs to run a year - servicing, tyres, MOT, tax, and fuel, benchmarked against typical UK prices." isPro={userIsPro}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>Cost calculator{bikeTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext}>Servicing, tyres, MOT, tax, and fuel - one honest number, benchmarked against typical UK prices.</p>
      <CostCalculatorForm signedIn initialBrand={toolInitialBrand} initialModel={toolInitialModel} initialBikeClass={toolInitialBikeClass} />
    </ProGate>
  );

  const buyingGuideContent = (
    <ProGate featureName="Buying a Used Bike" description="A buyer's checklist weighted by how old the bike actually is, so you know exactly what to check before handing any money over." isPro={userIsPro}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>Buying a used bike{bikeTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext}>A buyer checklist weighted by how old the bike actually is - not a generic list.</p>
      <BuyingGuideForm signedIn />
    </ProGate>
  );

  // No bikeTag/mileagePill header wrapper here, unlike the other
  // embedded tools above - PrivacyContent already has its own complete
  // heading (title, last-updated date, summary box), and it isn't
  // about this specific bike the way the other three tools are, so
  // wrapping it the same way would just add a redundant second heading.
  const privacyContent = <PrivacyContent />;

  // Available regardless of plan - unlike the embedded tools above,
  // account security isn't a Premium upsell, so this deliberately isn't
  // wrapped in ProGate. No bikeTag/mileagePill header, same reasoning as
  // privacyContent above - this is account-level, not about this
  // specific bike.
  const twoFactorEnabled = await isTwoFactorEnabled(session.email);
  const securityContent = (
    <SettingsTab
      email={session.email}
      displayName={userAccount?.displayName ?? ""}
      hasAvatar={!!userAccount?.avatarBlobName}
      initiallyEnabled={twoFactorEnabled}
      pendingDeletion={pendingDeletion}
    />
  );

  return (
    <DashboardShell
      vehicleKind="bike"
      vehicleName={bikeName}
      vehicleYear={bike.year}
      currentMileage={bike.currentMileage}
      distanceUnit={distanceUnit}
      userEmail={session.email}
      displayName={userAccount?.displayName}
      hasAvatar={!!userAccount?.avatarBlobName}
      pendingDeletion={pendingDeletion}
      isPro={userIsPro}
      proDaysRemaining={proStatus.daysRemaining}
      vehicles={switcherVehicles}
      activeVehicleId={bike.id}
      pendingReviewIds={pendingReviewIds}
      hasPendingReceiptRequests={pendingReceiptRequests.length > 0}
      dashboardContent={dashboardContent}
      serviceContent={serviceContent}
      fuelContent={fuelContent}
      modsContent={modsContent}
      labourContent={labourContent}
      billsContent={billsContent}
      remindersContent={remindersContent}
      reportsContent={reportsContent}
      storyContent={<ProGate featureName="The Story So Far" description="An AI-generated narrative of your ownership - your bike's history told as a story, with insights on what's been done, what's coming, and how your costs compare." isPro={userIsPro}><StorySoFarTab bikeNickname={bike.nickname} registration={currentRegistration} currentMileage={bike.currentMileage} distanceUnit={distanceUnit} initialStory={initialStory} sellerPrep={sellerPrep} /></ProGate>}
      shareLinksContent={shareLinksContent}
      quoteCheckerContent={quoteCheckerContent}
      costCalculatorContent={costCalculatorContent}
      buyingGuideContent={buyingGuideContent}
      privacyContent={privacyContent}
      transferOwnershipContent={transferOwnershipContent}
      securityContent={securityContent}
      storyReady={storyReady}
      hasIncomingRequest={!!incomingRequest}
    />
  );
}

// The car-active dashboard - deliberately a separate function, not a
// giant if/else woven through the ~700 lines above. Keeps the existing,
// working bike path completely untouched (verified: same route list,
// same component behaviour) rather than risking it via an inline
// branch. Trimmed to what's actually built for cars so far: no Reports/
// Story/Shareable Links/Transfer ownership/Quote Checker/Cost
// Calculator/Buying Guide content is assembled at all (DashboardShell's
// own CAR_UNAVAILABLE_SECTIONS hides their nav entries, so nothing here
// needs to produce placeholder JSX for them).
async function renderCarDashboard(
  email: string,
  car: CarDoc,
  allCars: CarDoc[],
  hasAnyBike: boolean,
  userAccount: Awaited<ReturnType<typeof getUserDoc>>,
  pendingDeletion: ReturnType<typeof getPendingDeletionInfo>
) {
  const [bikes, proStatus, twoFactorEnabled] = await Promise.all([
    hasAnyBike ? getBikesForUser(email) : Promise.resolve([]),
    getProStatus(email),
    isTwoFactorEnabled(email),
  ]);
  const userIsPro = proStatus.isPro;

  const distanceUnit: DistanceUnit = car.distanceUnit ?? "mi";
  const fuelEconomyUnit: FuelEconomyUnit = car.fuelEconomyUnit ?? "mpg";
  const currency: Currency = car.currency ?? "GBP";

  const [records, fuelLogs, mods, bills, labour, reminders, rates, carShareLinks, pendingCarReceiptRequests] = await Promise.all([
    getCarServiceRecords(email, car.id),
    getCarFuelLogs(email, car.id),
    getCarMods(email, car.id),
    getCarBills(email, car.id),
    getCarLabour(email, car.id),
    getCarReminders(email, car.id),
    getExchangeRates(),
    getCarShareLinksForUser(email),
    getPendingCarReceiptRequestsForOwner(email),
  ]);
  const carNames: Record<string, string> = {};
  for (const c of allCars) {
    carNames[c.id] = c.nickname ? `${c.nickname} (${c.make} ${c.model})` : `${c.make} ${c.model}`;
  }

  const pendingReviewIds = {
    service: records.filter((r) => r.needsReview).map((r) => r.id),
    fuel: fuelLogs.filter((f) => f.needsReview).map((f) => f.id),
    mods: mods.filter((m) => m.needsReview).map((m) => m.id),
    bills: bills.filter((b) => b.needsReview).map((b) => b.id),
    labour: labour.filter((l) => l.needsReview).map((l) => l.id),
  };

  const mileagePoints = gatherCarMileagePoints(records, mods, fuelLogs, bills, labour);
  const currentYear = new Date().getFullYear();
  const yearSpend = computeCarYearSpend(records, mods, fuelLogs, bills, currentYear, labour);
  const overBudget = car.annualBudget != null && yearSpend >= car.annualBudget;
  const summary = computeCarSpendSummary(records, mods, fuelLogs, bills, labour);

  // DashboardStatCards' MPG calc is petrol/diesel/hybrid-only (a litres
  // reading, not a kWh one) - the same reason Phase 3's receipt scanner
  // never grew EV-charging support. Charging-only entries (no litres at
  // all) are filtered out here rather than passed through with a fake
  // litres value; a fully electric car simply shows "-" for Actual
  // economy; the same honest "doesn't apply" this app already uses for
  // the assistant's own getMpgTrend tool.
  const mpgFuelLogs = fuelLogs
    .filter((f): f is typeof f & { litres: number } => f.litres != null)
    .map((f) => ({ id: f.id, mileage: f.mileage, litres: f.litres, filledToFull: f.filledToFull ?? false, date: f.date, cost: f.cost }));

  // Same electric-filtering reasoning as mpgFuelLogs above, plus the two
  // extra fields (mileageConfidence/mileageAnomaly) computeCarMpgSeries
  // actually needs that the DashboardStatCards-only shape above doesn't.
  const mpgSeries = computeCarMpgSeries(
    fuelLogs
      .filter((f): f is typeof f & { litres: number } => f.litres != null)
      .map((f) => ({
        id: f.id, mileage: f.mileage, litres: f.litres, filledToFull: f.filledToFull ?? false, date: f.date,
        mileageConfidence: f.mileageConfidence, mileageAnomaly: f.mileageAnomaly,
      })),
    car.dvlaData?.officialCombinedMpg
  );
  const fuelCostPoints = fuelLogs.map((f) => ({ id: f.id, date: f.date, cost: f.cost, mileage: f.mileage }));

  const recentActivity: RecentActivityItem[] = [
    ...records.map((r) => ({
      id: r.id, reviewCategory: "service" as const, date: r.date, icon: "🔧", type: "Service",
      description: CAR_JOB_LABELS[r.jobType] ?? r.jobType, category: "Servicing & repairs", cost: r.cost, mileage: r.mileage,
    })),
    ...fuelLogs.map((f) => ({
      id: f.id, reviewCategory: "fuel" as const, date: f.date, icon: "⛽", type: "Fuel",
      description: f.fuelType === "electric" ? `${(f.kwh ?? 0).toFixed(1)} kWh` : `${(f.litres ?? 0).toFixed(1)}L${f.filledToFull ? " (full)" : ""}`,
      category: "Fuel", cost: f.cost, mileage: f.mileage,
    })),
    ...mods.map((m) => ({
      id: m.id, reviewCategory: "mods" as const, date: m.date, icon: "⚙", type: "Part",
      description: m.name, category: "Parts & Accessories", cost: m.cost, mileage: m.mileage,
    })),
    ...bills.map((b) => ({
      id: b.id, reviewCategory: "bills" as const, date: b.date, icon: "📄", type: "Bill",
      description: CAR_BILL_LABELS[b.billType] ?? b.billType, category: "Insurance/tax/MOT/finance", cost: b.cost,
    })),
    ...labour.map((l) => ({
      id: l.id, reviewCategory: "labour" as const, date: l.date, icon: "🔨", type: "Labour",
      description: CAR_LABOUR_LABELS[l.category] ?? l.category, category: "Labour", cost: l.cost, mileage: l.mileage,
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);

  const carName = car.nickname ? `${car.nickname} - ${car.make} ${car.model}` : `${car.make} ${car.model}`;
  const currentRegistration = getCarCurrentRegistration(car);
  const carTag = (car.nickname || currentRegistration) ? (
    <span className={styles.headingBikeTag}>
      {car.nickname}
      {car.nickname && currentRegistration && " · "}
      {currentRegistration}
    </span>
  ) : null;
  const mileagePill = (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
      <NotificationBell />
      <div className={styles.headerMileagePill}>
        <Icon name="currentMiles" size={15} />
        {Math.round(convertMilesToDisplay(car.currentMileage, distanceUnit)).toLocaleString()} {distanceUnit === "km" ? "km" : "mi"}
      </div>
    </div>
  );

  const dashboardContent = (
    <ChartFilterProvider>
      {overBudget && (
        <div className={styles.budgetWarningBanner}>
          ⚠ <strong>You&apos;re over your {currentYear} budget</strong> - {formatCurrency(yearSpend, currency, rates)} spent against a{" "}
          {formatCurrency(car.annualBudget as number, currency, rates)} budget, {formatCurrency(yearSpend - (car.annualBudget as number), currency, rates)} over.
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>Dashboard{carTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext} style={{ marginBottom: "1rem" }}>Here&apos;s how your car looks today.</p>
      <ScanReceiptButton isPro={userIsPro} vehicleKind="car" />
      <ChartFilterBar />
      <div style={{ marginBottom: "1rem" }}>
        <UnitSettings distanceUnit={distanceUnit} fuelEconomyUnit={fuelEconomyUnit} currency={currency} vehicleKind="car" />
      </div>
      <div className={styles.dashboardStatsGrid}>
        <DashboardStatCards
          records={records}
          mods={mods}
          bills={bills}
          labour={labour}
          fuelLogs={mpgFuelLogs}
          currentMileage={car.currentMileage}
          startingMileage={car.startingMileage}
          currency={currency}
          rates={rates}
          distanceUnit={distanceUnit}
          fuelEconomyUnit={fuelEconomyUnit}
          isPro={userIsPro}
        />
        <div className={styles.statCard}>
          <div className={`${styles.statCardIcon} ${styles.statCardIconNeutral}`}><Icon name="currentMiles" size={16} /></div>
          <div className={styles.statCardValue}>{Math.round(convertMilesToDisplay(car.currentMileage, distanceUnit)).toLocaleString()}</div>
          <div className={styles.statCardLabel}>Current {distanceUnit === "km" ? "km" : "miles"}</div>
        </div>
        {userIsPro ? (
          <div className={styles.statCard}>
            <div className={`${styles.statCardIcon} ${styles.statCardIconNeutral}`}><Icon name="spendThisYear" size={16} /></div>
            <div className={styles.statCardValue}>{formatCurrency(yearSpend, currency, rates)}</div>
            <div className={styles.statCardLabel}>Spend this year</div>
          </div>
        ) : (
          <LockedStatCard icon="spendThisYear" iconClass={styles.statCardIconNeutral} label="Spend this year" />
        )}
      </div>

      <div className={`${styles.dashboardTwoCol} ${styles.equalHeightRow}`}>
        <BudgetWidget yearSpend={yearSpend} currentYear={currentYear} initialBudget={car.annualBudget} currency={currency} rates={rates} vehicleKind="car" />
        <div className={styles.chartCard}>
          {summary.grandTotal > 0 ? (
            <SpendDonutChart records={records} mods={mods} fuelLogs={fuelLogs} bills={bills} labour={labour} currency={currency} rates={rates} initialChartType={car.chartTypes?.["spend-donut"] === "bar" ? "bar" : "pie"} isPro={userIsPro} vehicleKind="car" />
          ) : (
            <>
              <div className={styles.chartCardTitle}>Spend by category</div>
              <p className={styles.emptyNote}>Log something to see this fill in.</p>
            </>
          )}
        </div>
      </div>

      <div className={styles.dashboardTwoCol}>
        <div className={styles.chartCard}>
          {mileagePoints.length > 0 ? (
            <MileageChart points={mileagePoints} distanceUnit={distanceUnit} initialChartType={car.chartTypes?.["mileage"] === "bar" ? "bar" : "line"} vehicleKind="car" />
          ) : (
            <>
              <div className={styles.chartCardTitle}>{distanceUnit === "km" ? "Kilometres" : "Mileage"} over time</div>
              <p className={styles.emptyNote}>Log a couple of entries to see your mileage build up.</p>
            </>
          )}
        </div>
        <div className={styles.chartCard}>
          <div className={styles.chartCardTitle}>Recent activity</div>
          <RecentActivity items={recentActivity} distanceUnit={distanceUnit} currency={currency} rates={rates} />
        </div>
      </div>

      <CarExportShareSection isPro={userIsPro} />
    </ChartFilterProvider>
  );

  const carReportsContent = (
    <ProGate featureName="Reports" description="Every chart in one place - fuel economy, running costs, and category spend trends over the life of your car." isPro={userIsPro}>
    <ChartFilterProvider>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>Reports{carTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext}>Every chart in one place - see where the money&apos;s really going, and whether your car&apos;s getting thirstier with age.</p>
      <p className={styles.subtext} style={{ marginBottom: "1rem" }}>Every chart in one place.</p>
      <ChartFilterBar />
      <div className={styles.reportsGrid}>
        <div className={styles.chartCard}>
          {mpgSeries.length > 0 ? (
            <MpgChart
              series={mpgSeries}
              fuelEconomyUnit={fuelEconomyUnit}
              distanceUnit={distanceUnit}
              initialChartType={car.chartTypes?.["mpg"] === "bar" ? "bar" : "line"}
              currency={currency}
              rates={rates}
              excludedFuelEntries={fuelLogs
                .filter((f) => f.mileageConfidence === "estimated" || f.mileageConfidence === "interpolated")
                .map((f) => ({ date: f.date, cost: f.cost }))}
              vehicleKind="car"
            />
          ) : (
            <>
              <div className={styles.chartCardTitle}>{fuelEconomyUnit === "l100km" ? "Fuel economy" : "MPG"} over time</div>
              <p className={styles.emptyNote}>Log two consecutive full-tank fill-ups to see this.</p>
            </>
          )}
        </div>
        <div className={styles.chartCard}>
          {fuelCostPoints.length > 0 ? (
            <FuelCostChart points={fuelCostPoints} currency={currency} rates={rates} distanceUnit={distanceUnit} initialChartType={car.chartTypes?.["fuel-cost"] === "bar" ? "bar" : "line"} vehicleKind="car" />
          ) : (
            <>
              <div className={styles.chartCardTitle}>Fuel cost over time</div>
              <p className={styles.emptyNote}>Log a fuel fill-up to see cost trends here.</p>
            </>
          )}
        </div>
        <div className={styles.chartCard}>
          {records.length > 0 ? (
            <CategorySpendChart chartId="servicing-spend" title="Servicing spend over time" items={records} category="service" color="#1C1D20" currency={currency} rates={rates} distanceUnit={distanceUnit} initialChartType={car.chartTypes?.["servicing-spend"] === "line" ? "line" : "bar"} vehicleKind="car" />
          ) : (
            <>
              <div className={styles.chartCardTitle}>Servicing spend over time</div>
              <p className={styles.emptyNote}>No servicing logged yet.</p>
            </>
          )}
        </div>
        <div className={styles.chartCard}>
          {mods.length > 0 ? (
            <CategorySpendChart chartId="mods-spend" title="Parts & Accessories spend over time" items={mods} category="mods" color="#EE9A2E" currency={currency} rates={rates} distanceUnit={distanceUnit} initialChartType={car.chartTypes?.["mods-spend"] === "line" ? "line" : "bar"} vehicleKind="car" />
          ) : (
            <>
              <div className={styles.chartCardTitle}>Parts & Accessories spend over time</div>
              <p className={styles.emptyNote}>No modifications logged yet.</p>
            </>
          )}
        </div>
        <div className={styles.chartCard}>
          {bills.length > 0 ? (
            <CategorySpendChart chartId="bills-spend" title="Insurance, tax, MOT & finance spend over time" items={bills} category="bills" color="#8A867D" currency={currency} rates={rates} distanceUnit={distanceUnit} supportsMileageView={false} initialChartType={car.chartTypes?.["bills-spend"] === "line" ? "line" : "bar"} vehicleKind="car" />
          ) : (
            <>
              <div className={styles.chartCardTitle}>Insurance, tax, MOT & finance spend over time</div>
              <p className={styles.emptyNote}>No insurance, tax, or MOT payments logged yet.</p>
            </>
          )}
        </div>
        <div className={styles.chartCard}>
          {labour.length > 0 ? (
            <CategorySpendChart chartId="labour-spend" title="Labour spend over time" items={labour} category="labour" color="#3E6B99" currency={currency} rates={rates} distanceUnit={distanceUnit} initialChartType={car.chartTypes?.["labour-spend"] === "line" ? "line" : "bar"} vehicleKind="car" />
          ) : (
            <>
              <div className={styles.chartCardTitle}>Labour spend over time</div>
              <p className={styles.emptyNote}>No labour logged yet.</p>
            </>
          )}
        </div>
        <CarCustomFilterPanel records={records} mods={mods} bills={bills} fuelLogs={mpgFuelLogs} currency={currency} rates={rates} fuelEconomyUnit={fuelEconomyUnit} />
      </div>
    </ChartFilterProvider>
    </ProGate>
  );

  // Pre-population for the three embedded tools below - mirrors the
  // standalone /cars/quote-checker and /cars/cost-calculator pages'
  // own initialBrand/initialCarClass computation exactly (each of those
  // two pages already duplicates this rather than sharing it with the
  // other, so a third copy here matches the existing convention).
  const carSlug = slugifyCarMake(car.make);
  const toolInitialCarBrand = CAR_BRAND_OPTIONS.some((b) => b.value === carSlug) ? carSlug : "other";
  const toolInitialCarClass: CarBenchmarkClass | undefined =
    car.fuelType !== "electric" && car.engineLitres ? classFromEngineLitres(car.engineLitres) : undefined;

  const carQuoteCheckerContent = (
    <ProGate featureName="Quote Checker" description="Check whether a quote you've been given is fair, benchmarked against real UK car service and repair prices." isPro={userIsPro}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>Quote Checker{carTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext}>Four quick questions. One honest answer, benchmarked against typical UK prices.</p>
      <CarQuoteForm signedIn initialBrand={toolInitialCarBrand} initialCarClass={toolInitialCarClass} />
    </ProGate>
  );

  const carCostCalculatorContent = (
    <ProGate featureName="Cost Calculator" description="Work out what a car really costs to run a year - servicing, tyres, MOT, tax, and fuel, benchmarked against typical UK prices." isPro={userIsPro}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>Cost calculator{carTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext}>Servicing, tyres, MOT, tax, and fuel - one honest number, benchmarked against typical UK prices.</p>
      <CarCostCalculatorForm signedIn initialBrand={toolInitialCarBrand} initialCarClass={toolInitialCarClass} />
    </ProGate>
  );

  const carBuyingGuideContent = (
    <ProGate featureName="Buying a Used Car" description="A buyer's checklist weighted by how old the car actually is, so you know exactly what to check before handing any money over." isPro={userIsPro}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>Buying a used car{carTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext}>A buyer checklist weighted by how old the car actually is - not a generic list.</p>
      <CarBuyingGuideForm />
    </ProGate>
  );

  const serviceContent = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>Service{carTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext}>Every oil change, every brake job - a real maintenance record, not a hazy memory of &quot;I think I did it.&quot;</p>
      <LogCarServiceForm initialMileage={car.currentMileage} mileageHistory={mileagePoints} startingMileage={car.startingMileage} dateAdded={car.dateAdded} distanceUnit={distanceUnit} currency={currency} rates={rates} carYear={car.year} isCustomBuild={car.isCustomBuild} />
      <h2 className={styles.sectionHeading}>Service history</h2>
      {records.length === 0 ? (
        <div className={styles.card}><p className={styles.cardBody}>No service records logged yet. Log your first one above.</p></div>
      ) : (
        records.map((r) => <CarServiceHistoryCard key={r.id} record={r} distanceUnit={distanceUnit} currency={currency} rates={rates} />)
      )}
    </>
  );

  const fuelContent = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>Fuel{carTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext}>Log a fill-up or charge in seconds.</p>
      <LogCarFuelForm fuelType={car.fuelType} initialMileage={car.currentMileage} mileageHistory={mileagePoints} startingMileage={car.startingMileage} dateAdded={car.dateAdded} distanceUnit={distanceUnit} currency={currency} rates={rates} carYear={car.year} isCustomBuild={car.isCustomBuild} />
      <h2 className={styles.sectionHeading}>Fuel log</h2>
      {fuelLogs.length === 0 ? (
        <div className={styles.card}><p className={styles.cardBody}>No fuel fill-ups or charges logged yet. Log your first one above.</p></div>
      ) : (
        fuelLogs.map((f) => <CarFuelLogCard key={f.id} log={f} distanceUnit={distanceUnit} currency={currency} rates={rates} />)
      )}
    </>
  );

  const modsContent = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>Parts & Accessories{carTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext}>Every upgrade, with the receipt to prove it wasn&apos;t a bodge job.</p>
      <LogCarModForm initialMileage={car.currentMileage} mileageHistory={mileagePoints} startingMileage={car.startingMileage} dateAdded={car.dateAdded} distanceUnit={distanceUnit} currency={currency} rates={rates} carYear={car.year} isCustomBuild={car.isCustomBuild} />
      <h2 className={styles.sectionHeading}>History</h2>
      {mods.length === 0 ? (
        <div className={styles.card}><p className={styles.cardBody}>No modifications or accessories logged yet.</p></div>
      ) : (
        mods.map((m) => <CarModCard key={m.id} mod={m} distanceUnit={distanceUnit} currency={currency} rates={rates} />)
      )}
    </>
  );

  const billsContent = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>Insurance, Tax, MOT &amp; Finance{carTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext}>The paperwork you genuinely can&apos;t afford to forget, tracked in one place.</p>
      <LogCarBillForm currency={currency} rates={rates} carYear={car.year} isCustomBuild={car.isCustomBuild} />
      <CarExcludeFromReportToggle
        fieldName="includeInsuranceInReport"
        included={Boolean(car.includeInsuranceInReport)}
        checkboxLabel="Show insurance history in my buyer report"
        confirmMessage="A future buyer will have their own insurance costs - showing yours could make your car look pricier to run than it will actually be for them. Show anyway?"
        noteText="Off by default - insurance depends on who's holding the policy, not the car, so a future buyer's own premium will be different regardless of what you've paid. Road tax and MOT are always shown, since those are tied to the car itself."
      />
      <CarExcludeFromReportToggle
        fieldName="includeFinanceInReport"
        included={Boolean(car.includeFinanceInReport)}
        checkboxLabel="Show finance history in my buyer report"
        confirmMessage="A future buyer would have their own finance agreement, or none at all - showing yours could make your car look pricier to run than it will actually be for them. Show anyway?"
        noteText="Off by default - a finance agreement is personal to whoever took it out, not the car, so a future buyer's own deal (if they have one) will be completely different. Road tax and MOT are always shown, since those are tied to the car itself."
      />
      <h2 className={styles.sectionHeading}>History</h2>
      {bills.length === 0 ? (
        <div className={styles.card}><p className={styles.cardBody}>No insurance, tax, MOT, ULEZ/CAZ, congestion charge, or finance payments logged yet.</p></div>
      ) : (
        bills.map((b) => (
          <CarBillCard
            key={b.id}
            bill={b}
            currency={currency}
            rates={rates}
            includeInsuranceInReport={Boolean(car.includeInsuranceInReport)}
            includeFinanceInReport={Boolean(car.includeFinanceInReport)}
          />
        ))
      )}
    </>
  );

  const labourContent = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>Labour{carTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext}>Workshop time and diagnostic hours - the part of the bill that&apos;s easy to forget once the parts themselves are paid for.</p>
      <LogCarLabourForm initialMileage={car.currentMileage} mileageHistory={mileagePoints} startingMileage={car.startingMileage} dateAdded={car.dateAdded} distanceUnit={distanceUnit} currency={currency} rates={rates} carYear={car.year} isCustomBuild={car.isCustomBuild} />
      <h2 className={styles.sectionHeading}>History</h2>
      {labour.length === 0 ? (
        <div className={styles.card}><p className={styles.cardBody}>No labour logged yet.</p></div>
      ) : (
        labour.map((l) => <CarLabourCard key={l.id} labour={l} distanceUnit={distanceUnit} currency={currency} rates={rates} pendingReviewIds={pendingReviewIds} mileageHistory={mileagePoints} currentMileage={car.currentMileage} />)
      )}
    </>
  );

  const remindersContent = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>Reminders{carTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext}>RoadVerdict remembers so you don&apos;t have to. Nothing missed, nothing lapsed.</p>
      {!userIsPro && (
        <>
          <p className={styles.subtext} style={{ marginBottom: "1rem" }}>
            <Icon name="lock" size={13} /> Free plan: every reminder is tracked here with its OK/Overdue status, but the exact due date/mileage is Premium.
          </p>
          <PlanComparisonCards userIsPro={false} showFreeCta={false} />
        </>
      )}
      {reminders.length === 0 ? (
        <div className={styles.card}><p className={styles.cardBody}>No reminders set yet. Tick &quot;Remind me&quot; when logging a service or a bill to add one.</p></div>
      ) : (
        reminders.map((r) => <CarReminderItem key={r.id} reminder={r} status={computeCarReminderStatus(r, car.currentMileage)} isPro={userIsPro} />)
      )}
    </>
  );

  const carShareLinksContent = (
    <CarShareLinksSection isPro={userIsPro}
      links={carShareLinks}
      carNames={carNames}
      appUrl={process.env.APP_URL ?? "https://roadverdict.co.uk"}
      requests={pendingCarReceiptRequests}
      carNickname={car.nickname}
      registration={currentRegistration}
      currentMileage={car.currentMileage}
      distanceUnit={distanceUnit}
    />
  );

  // Same cooldown window as car-story-so-far/route.ts, duplicated for
  // the same reason bike's own STORY_COOLDOWN_MS constant is: a route
  // handler isn't a regular importable module.
  const STORY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
  const initialCarStory = car.storyCache
    ? {
        generatedWithAi: car.storyCache.response.generatedWithAi,
        sharedStory: car.storyCache.response.sharedStory,
        ownerNotes: car.storyCache.response.ownerNotes,
        verdict: car.storyCache.response.verdict,
        generatedAt: car.storyCache.generatedAt,
        cached: true,
        nextAvailableAt: new Date(new Date(car.storyCache.generatedAt).getTime() + STORY_COOLDOWN_MS).toISOString(),
      }
    : null;

  const carSellerCore = await getCarSellerReportCore(email, car.id);
  const carStoryReady = carSellerCore.verdict.tier !== "limited-documentation";
  const carSellerWalkAwayIssues = buildCarWalkAwayIssues(car, carSellerCore.mileageCheck, carSellerCore.evidenceQuality);
  const carSellerPrep = {
    evidenceQuality: carSellerCore.evidenceQuality,
    prepIssues: buildSellerPrepIssues(carSellerWalkAwayIssues),
    upcomingCostItems: carSellerCore.upcomingCostItems,
    likelyQuestions: carSellerCore.detailedQuestions,
    prepPlan: buildSellerPrepPlan(
      carSellerCore.evidenceQuality.receiptCoveragePct,
      carSellerWalkAwayIssues.length,
      carSellerCore.upcomingCostItems.filter((i) => i.timing === "overdue").length,
      carSellerCore.detailedQuestions.length
    ),
  };

  const carStoryContent = (
    <ProGate featureName="The Story So Far" description="An AI-generated narrative of your ownership - your car's history told as a story, with insights on what's been done, what's coming, and how your costs compare." isPro={userIsPro}>
      <CarStorySoFarTab carNickname={car.nickname} registration={currentRegistration} currentMileage={car.currentMileage} distanceUnit={distanceUnit} initialStory={initialCarStory} sellerPrep={carSellerPrep} />
    </ProGate>
  );

  const pendingCarTransferRequests = await getPendingCarTransferRequestsForOwner(email);
  const carRequestsForThisCar = pendingCarTransferRequests.filter((r) => r.carId === car.id);
  const carOutgoingOffer = carRequestsForThisCar.find((r) => r.initiatedBy === "owner");
  const carIncomingRequest = carRequestsForThisCar.find((r) => r.initiatedBy === "recipient");

  const carTransferOwnershipContent = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>Transfer ownership{carTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext}>Selling this car? Hand the buyer your logged history instead of them starting fresh.</p>
      {carIncomingRequest && (
        <IncomingCarOwnershipRequestCard
          requestId={carIncomingRequest.id}
          requesterEmail={carIncomingRequest.recipientEmail}
          createdAt={carIncomingRequest.createdAt}
        />
      )}
      <CarTransferOwnershipSection
        pendingRequest={carOutgoingOffer ? { recipientEmail: carOutgoingOffer.recipientEmail, createdAt: carOutgoingOffer.createdAt, includeRecords: carOutgoingOffer.includeRecords } : null}
        carIsReadOnly={isCarReadOnly(car)}
      />
    </>
  );

  const privacyContent = <PrivacyContent />;
  const securityContent = (
    <SettingsTab
      email={email}
      displayName={userAccount?.displayName ?? ""}
      hasAvatar={!!userAccount?.avatarBlobName}
      initiallyEnabled={twoFactorEnabled}
      pendingDeletion={pendingDeletion}
    />
  );

  const switcherVehicles = [
    ...bikes.map((b) => ({
      id: b.id, kind: "bike" as const,
      name: b.nickname ? `${b.nickname} - ${b.make} ${b.model}` : `${b.make} ${b.model}`,
      year: b.year, currentMileage: b.currentMileage,
    })),
    ...allCars.map((c) => ({
      id: c.id, kind: "car" as const,
      name: c.nickname ? `${c.nickname} - ${c.make} ${c.model}` : `${c.make} ${c.model}`,
      year: c.year, currentMileage: c.currentMileage,
    })),
  ];

  return (
    <DashboardShell
      vehicleKind="car"
      vehicleName={carName}
      vehicleYear={car.year}
      currentMileage={car.currentMileage}
      distanceUnit={distanceUnit}
      userEmail={email}
      displayName={userAccount?.displayName}
      hasAvatar={!!userAccount?.avatarBlobName}
      pendingDeletion={pendingDeletion}
      isPro={userIsPro}
      proDaysRemaining={proStatus.daysRemaining}
      vehicles={switcherVehicles}
      activeVehicleId={car.id}
      pendingReviewIds={pendingReviewIds}
      hasPendingReceiptRequests={pendingCarReceiptRequests.length > 0}
      dashboardContent={dashboardContent}
      serviceContent={serviceContent}
      fuelContent={fuelContent}
      modsContent={modsContent}
      labourContent={labourContent}
      billsContent={billsContent}
      remindersContent={remindersContent}
      reportsContent={carReportsContent}
      shareLinksContent={carShareLinksContent}
      quoteCheckerContent={carQuoteCheckerContent}
      costCalculatorContent={carCostCalculatorContent}
      buyingGuideContent={carBuyingGuideContent}
      storyContent={carStoryContent}
      transferOwnershipContent={carTransferOwnershipContent}
      privacyContent={privacyContent}
      securityContent={securityContent}
      storyReady={carStoryReady}
      hasIncomingRequest={!!carIncomingRequest}
    />
  );
}
