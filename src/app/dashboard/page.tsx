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
import { getReminders, computeReminderStatus } from "@/lib/tracker/reminder";
import { getShareLinksForUser } from "@/lib/tracker/shareLink";
import { getPendingReceiptRequestsForOwner } from "@/lib/tracker/receiptRequest";
import { ShareLinksSection } from "./ShareLinksSection";
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
import { ServiceHistoryCard } from "./ServiceHistoryCard";
import { FuelLogCard } from "./FuelLogCard";
import { ModCard } from "./ModCard";
import { BillCard } from "./BillCard";
import { ReminderItem } from "./ReminderItem";
import { BudgetWidget } from "./BudgetWidget";
import { SpendDonutChart } from "./SpendDonutChart";
import { MileageChart } from "./MileageChart";
import { MpgChart } from "./MpgChart";
import { FuelCostChart } from "./FuelCostChart";
import { CategorySpendChart } from "./CategorySpendChart";
import { UnitSettings } from "./UnitSettings";
import { ExportShareSection } from "./ExportShareSection";
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
import { getSellerReportCore } from "@/lib/tracker/sellerReportData";
import { buildWalkAwayIssues } from "@/lib/tracker/walkAwayRisks";
import { buildSellerPrepIssues, buildSellerPrepPlan } from "@/lib/tracker/sellerPrep";
import { StorySoFarTab } from "./StorySoFarTab";
import { ChartFilterProvider } from "./ChartFilterContext";
import { ChartFilterBar } from "./ChartFilterBar";
import { DashboardStatCards } from "./DashboardStatCards";
import { CustomFilterPanel } from "./CustomFilterPanel";
import { ScanReceiptButton } from "./ScanReceiptButton";
import { RegistrationBackfillBanner } from "./RegistrationBackfillBanner";
import { Icon } from "./Icon";
import { LockedStatCard } from "./LockedStatCard";
import { isPro } from "@/lib/subscriptions";
import { ProGate } from "./ProGate";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const bikes = await getBikesForUser(session.email);
  const bike = await pickActiveBike(bikes);
  const shareLinks = await getShareLinksForUser(session.email);
  const userIsPro = await isPro(session.email);
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

  const [records, fuelLogs, mods, bills, reminders, rates] = await Promise.all([
    getServiceRecords(session.email, bike.id),
    getFuelLogs(session.email, bike.id),
    getMods(session.email, bike.id),
    getBills(session.email, bike.id),
    getReminders(session.email, bike.id),
    getExchangeRates(),
  ]);
  const brandValue = slugifyMake(bike.make);
  const pendingReviewIds = {
    service: records.filter((r) => r.needsReview).map((r) => r.id),
    fuel: fuelLogs.filter((f) => f.needsReview).map((f) => f.id),
    mods: mods.filter((m) => m.needsReview).map((m) => m.id),
    bills: bills.filter((b) => b.needsReview).map((b) => b.id),
  };
  const actualMpg = computeActualMPG(fuelLogs, bike.dvlaData?.officialCombinedMpg);
  const mpgSeries = computeMPGSeries(fuelLogs, bike.dvlaData?.officialCombinedMpg);
  const mileagePoints = gatherMileagePoints(records, mods, fuelLogs, bills);
  const fuelCostPoints = fuelLogs.map((f) => ({ id: f.id, date: f.date, cost: f.cost, mileage: f.mileage }));
  const summary = computeSpendSummary(records, mods, fuelLogs, bills);
  const currentYear = new Date().getFullYear();
  const yearSpend = computeYearSpend(records, mods, fuelLogs, bills, currentYear);
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
      category: "Insurance/tax/MOT", cost: b.cost,
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
            <a href="https://tfl.gov.uk/modes/driving/check-your-vehicle" target="_blank" rel="noopener">Check definitively on TfL&apos;s own site ↗</a>
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
            <SpendDonutChart records={records} mods={mods} fuelLogs={fuelLogs} bills={bills} currency={currency} rates={rates} initialChartType={bike.chartTypes?.["spend-donut"] === "bar" ? "bar" : "pie"} isPro={userIsPro} />
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
      <LogServiceForm initialMileage={bike.currentMileage} mileageHistory={mileagePoints} distanceUnit={distanceUnit} currency={currency} rates={rates} bikeYear={bike.year} isCustomBuild={bike.isCustomBuild} />
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
      <LogFuelForm initialMileage={bike.currentMileage} mileageHistory={mileagePoints} distanceUnit={distanceUnit} currency={currency} rates={rates} bikeYear={bike.year} isCustomBuild={bike.isCustomBuild} />
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
      <LogModForm initialMileage={bike.currentMileage} mileageHistory={mileagePoints} distanceUnit={distanceUnit} currency={currency} rates={rates} bikeYear={bike.year} isCustomBuild={bike.isCustomBuild} />
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
        <h1 className={styles.heading}>Insurance, tax & MOT{bikeTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext}>The paperwork you genuinely can&apos;t afford to forget, tracked in one place, automatically.</p>
      <LogBillForm currency={currency} rates={rates} bikeYear={bike.year} isCustomBuild={bike.isCustomBuild} />
      <h2 className={styles.sectionHeading}>History</h2>
      {bills.length === 0 ? (
        <div className={styles.card}><p className={styles.cardBody}>No insurance, tax, or MOT payments logged yet.</p></div>
      ) : (
        bills.map((b) => <BillCard key={b.id} bill={b} currency={currency} rates={rates} pendingReviewIds={pendingReviewIds} distanceUnit={distanceUnit} />)
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
        <p className={styles.subtext} style={{ marginBottom: "1rem" }}>
          <Icon name="lock" size={13} /> Free plan: every reminder is tracked here with its OK/Overdue status, but the exact due date/mileage is Premium, and we won&apos;t email or notify you automatically when one&apos;s due - check back here.
        </p>
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
            <CategorySpendChart chartId="bills-spend" title="Insurance, tax & MOT spend over time" items={bills} category="bills" color="#8A867D" currency={currency} rates={rates} distanceUnit={distanceUnit} supportsMileageView={false} initialChartType={bike.chartTypes?.["bills-spend"] === "line" ? "line" : "bar"} />
          ) : (
            <>
              <div className={styles.chartCardTitle}>Insurance, tax & MOT spend over time</div>
              <p className={styles.emptyNote}>No insurance, tax, or MOT payments logged yet.</p>
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

  const switcherBikes = bikes.map((b) => ({
    id: b.id,
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

  return (
    <DashboardShell
      bikeName={bikeName}
      bikeYear={bike.year}
      currentMileage={bike.currentMileage}
      distanceUnit={distanceUnit}
      userEmail={session.email}
      isPro={userIsPro}
      bikes={switcherBikes}
      activeBikeId={bike.id}
      pendingReviewIds={pendingReviewIds}
      hasPendingReceiptRequests={pendingReceiptRequests.length > 0}
      dashboardContent={dashboardContent}
      serviceContent={serviceContent}
      fuelContent={fuelContent}
      modsContent={modsContent}
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
      storyReady={storyReady}
      hasIncomingRequest={!!incomingRequest}
    />
  );
}
