// Place at: src/app/dashboard/page.tsx
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import styles from "./dashboard.module.css";
import LogoutButton from "./LogoutButton";
import { getBikesForUser, pickActiveBike, getCurrentRegistration } from "@/lib/tracker/bike";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getFuelLogs, computeActualMPG, computeMPGSeries } from "@/lib/tracker/fuelLog";
import { getMods } from "@/lib/tracker/mod";
import { getBills } from "@/lib/tracker/bill";
import { getReminders, computeReminderStatus } from "@/lib/tracker/reminder";
import { getShareLinksForUser } from "@/lib/tracker/shareLink";
import { getPendingReceiptRequestsForOwner } from "@/lib/tracker/receiptRequest";
import { ShareLinksSection } from "./ShareLinksSection";
import { computeSpendSummary, computeYearSpend, gatherMileagePoints } from "@/lib/tracker/summary";
import { slugifyMake } from "@/lib/motorcycleModels";
import type { Region } from "@/lib/priceData";
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
import { StorySoFarTab } from "./StorySoFarTab";
import { ChartFilterProvider } from "./ChartFilterContext";
import { ChartFilterBar } from "./ChartFilterBar";
import { DashboardStatCards } from "./DashboardStatCards";
import { CustomFilterPanel } from "./CustomFilterPanel";
import { ScanReceiptButton } from "./ScanReceiptButton";
import { RegistrationBackfillBanner } from "./RegistrationBackfillBanner";
import { Icon } from "./Icon";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const bikes = await getBikesForUser(session.email);
  const bike = await pickActiveBike(bikes);
  const shareLinks = await getShareLinksForUser(session.email);
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
          {(bike.nickname || getCurrentRegistration(bike)) && (
            <span className={styles.headingBikeTag}>
              {bike.nickname}
              {bike.nickname && getCurrentRegistration(bike) && " · "}
              {getCurrentRegistration(bike)}
            </span>
          )}
        </h1>
        <div className={styles.headerMileagePill}>
          <Icon name="currentMiles" size={15} />
          {Math.round(convertMilesToDisplay(bike.currentMileage, distanceUnit)).toLocaleString()} {distanceUnit === "km" ? "km" : "mi"}
        </div>
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

      <ScanReceiptButton />

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
        />
        <div className={styles.statCard}>
          <div className={`${styles.statCardIcon} ${styles.statCardIconNeutral}`}>
            <Icon name="currentMiles" size={16} />
          </div>
          <div className={styles.statCardValue}>{Math.round(convertMilesToDisplay(bike.currentMileage, distanceUnit)).toLocaleString()}</div>
          <div className={styles.statCardLabel}>Current {distanceUnit === "km" ? "km" : "miles"}</div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statCardIcon} ${styles.statCardIconNeutral}`}>
            <Icon name="spendThisYear" size={16} />
          </div>
          <div className={styles.statCardValue}>{formatCurrency(yearSpend, currency, rates)}</div>
          <div className={styles.statCardLabel}>Spend this year</div>
        </div>
      </div>

      <div className={`${styles.dashboardTwoCol} ${styles.equalHeightRow}`}>
        <BudgetWidget yearSpend={yearSpend} currentYear={currentYear} initialBudget={bike.annualBudget} currency={currency} rates={rates} />
        <div className={styles.chartCard}>
          {summary.grandTotal > 0 ? (
            <SpendDonutChart records={records} mods={mods} fuelLogs={fuelLogs} bills={bills} currency={currency} rates={rates} initialChartType={bike.chartTypes?.["spend-donut"] === "bar" ? "bar" : "pie"} />
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

      <ExportShareSection />
    </ChartFilterProvider>
  );

  const serviceContent = (
    <>
      <h1 className={styles.heading}>Service</h1>
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
      <h1 className={styles.heading}>Fuel</h1>
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
      <h1 className={styles.heading}>Parts & Accessories</h1>
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
      <h1 className={styles.heading}>Insurance, tax & MOT</h1>
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
      <h1 className={styles.heading}>Reminders</h1>
      <p className={styles.subtext}>RoadVerdict remembers so you don&apos;t have to. Nothing missed, nothing lapsed.</p>
      {reminders.length === 0 ? (
        <div className={styles.card}><p className={styles.cardBody}>No reminders set yet. Tick &quot;Remind me&quot; when logging a service or a bill to add one.</p></div>
      ) : (
        reminders.map((r) => <ReminderItem key={r.id} reminder={r} status={computeReminderStatus(r, bike.currentMileage)} />)
      )}
    </>
  );

  const reportsContent = (
    <ChartFilterProvider>
      <h1 className={styles.heading}>Reports</h1>
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
  );

  const shareLinksContent = (
    <ShareLinksSection
      links={shareLinks}
      bikeNames={bikeNames}
      appUrl={process.env.APP_URL ?? "https://roadverdict.co.uk"}
      requests={pendingReceiptRequests}
    />
  );

  const switcherBikes = bikes.map((b) => ({
    id: b.id,
    name: b.nickname ? `${b.nickname} - ${b.make} ${b.model}` : `${b.make} ${b.model}`,
    year: b.year,
    currentMileage: b.currentMileage,
  }));

  return (
    <DashboardShell
      bikeName={bikeName}
      bikeYear={bike.year}
      currentMileage={bike.currentMileage}
      distanceUnit={distanceUnit}
      userEmail={session.email}
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
      storyContent={<StorySoFarTab />}
      shareLinksContent={shareLinksContent}
    />
  );
}
