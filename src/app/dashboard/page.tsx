// Place at: src/app/dashboard/page.tsx
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import styles from "./dashboard.module.css";
import LogoutButton from "./LogoutButton";
import { getBike } from "@/lib/tracker/bike";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getFuelLogs, computeActualMPG, computeMPGSeries } from "@/lib/tracker/fuelLog";
import { getMods } from "@/lib/tracker/mod";
import { getBills } from "@/lib/tracker/bill";
import { getReminders, computeReminderStatus } from "@/lib/tracker/reminder";
import { computeSpendSummary, computeYearSpend, gatherMileagePoints, bucketByMonth } from "@/lib/tracker/summary";
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

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const bike = await getBike(session.email);

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
          {bike.nickname ? `${bike.nickname} — ${bike.make} ${bike.model}` : `${bike.make} ${bike.model}`}
        </h1>
        <SetRegionForm />
      </main>
    );
  }

  const distanceUnit: DistanceUnit = bike.distanceUnit ?? "mi";
  const fuelEconomyUnit: FuelEconomyUnit = bike.fuelEconomyUnit ?? "mpg";
  const currency: Currency = bike.currency ?? "GBP";

  const [records, fuelLogs, mods, bills, reminders, rates] = await Promise.all([
    getServiceRecords(session.email),
    getFuelLogs(session.email),
    getMods(session.email),
    getBills(session.email),
    getReminders(session.email),
    getExchangeRates(),
  ]);
  const brandValue = slugifyMake(bike.make);
  const actualMpg = computeActualMPG(fuelLogs);
  const mpgSeries = computeMPGSeries(fuelLogs);
  const mileagePoints = gatherMileagePoints(records, mods, fuelLogs);
  const fuelCostPoints = fuelLogs.map((f) => ({ date: f.date, cost: f.cost }));
  const summary = computeSpendSummary(records, mods, fuelLogs, bills);
  const serviceMonthly = bucketByMonth(records.map((r) => ({ date: r.date, cost: r.cost })));
  const modsMonthly = bucketByMonth(mods.map((m) => ({ date: m.date, cost: m.cost })));
  const billsMonthly = bucketByMonth(bills.map((b) => ({ date: b.date, cost: b.cost })));
  const currentYear = new Date().getFullYear();
  const yearSpend = computeYearSpend(records, mods, fuelLogs, bills, currentYear);
  const milesTracked = bike.currentMileage - bike.startingMileage;
  const overBudget = bike.annualBudget != null && yearSpend >= bike.annualBudget;

  const recentActivity: RecentActivityItem[] = [
    ...records.map((r) => ({
      date: r.date, icon: "🔧", type: "Service",
      description: JOB_LABELS[r.jobType] ?? r.jobType,
      category: "Servicing & repairs", cost: r.cost, mileage: r.mileage,
    })),
    ...fuelLogs.map((f) => ({
      date: f.date, icon: "⛽", type: "Fuel",
      description: `${f.litres.toFixed(1)}L${f.filledToFull ? " (full)" : ""}`,
      category: "Fuel", cost: f.cost, mileage: f.mileage,
    })),
    ...mods.map((m) => ({
      date: m.date, icon: "⚙️", type: "Modification",
      description: m.name, category: "Modifications", cost: m.cost, mileage: m.mileage,
    })),
    ...bills.map((b) => ({
      date: b.date, icon: "📄", type: "Bill",
      description: BILL_LABELS[b.billType] ?? b.billType,
      category: "Insurance/tax/MOT", cost: b.cost,
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);

  const bikeName = bike.nickname ? `${bike.nickname} — ${bike.make} ${bike.model}` : `${bike.make} ${bike.model}`;

  const dashboardContent = (
    <>
      {overBudget && (
        <div className={styles.budgetWarningBanner}>
          ⚠️ <strong>You&apos;re over your {currentYear} budget</strong> - {formatCurrency(yearSpend, currency, rates)} spent against a{" "}
          {formatCurrency(bike.annualBudget as number, currency, rates)} budget, {formatCurrency(yearSpend - (bike.annualBudget as number), currency, rates)} over.
        </div>
      )}
      <h1 className={styles.heading}>Dashboard</h1>
      <p className={styles.subtext} style={{ marginBottom: "1rem" }}>Here&apos;s how your bike looks today.</p>

      <div style={{ marginBottom: "1rem" }}>
        <UnitSettings distanceUnit={distanceUnit} fuelEconomyUnit={fuelEconomyUnit} currency={currency} />
      </div>

      <div className={styles.dashboardStatsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statCardValue}>{formatCurrency(summary.grandTotal, currency, rates)}</div>
          <div className={styles.statCardLabel}>Total spend</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statCardValue}>{actualMpg ? formatFuelEconomy(actualMpg, fuelEconomyUnit) : "—"}</div>
          <div className={styles.statCardLabel}>Actual economy</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statCardValue}>
            {milesTracked > 0 ? formatCostPerDistance((summary.grandTotal / milesTracked) * 100, distanceUnit) : "—"}
          </div>
          <div className={styles.statCardLabel}>Per {distanceUnit === "km" ? "km" : "mile"}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statCardValue}>{Math.round(convertMilesToDisplay(bike.currentMileage, distanceUnit)).toLocaleString()}</div>
          <div className={styles.statCardLabel}>Current {distanceUnit === "km" ? "km" : "miles"}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statCardValue}>{formatCurrency(yearSpend, currency, rates)}</div>
          <div className={styles.statCardLabel}>Spend this year</div>
        </div>
      </div>

      <div className={styles.dashboardTwoCol}>
        <BudgetWidget yearSpend={yearSpend} currentYear={currentYear} initialBudget={bike.annualBudget} currency={currency} rates={rates} />
        <div className={styles.chartCard}>
          <div className={styles.chartCardTitle}>Spend by category</div>
          {summary.grandTotal > 0 ? (
            <SpendDonutChart servicingTotal={summary.servicingTotal} modsTotal={summary.modsTotal} fuelTotal={summary.fuelTotal} billsTotal={summary.billsTotal} currency={currency} rates={rates} />
          ) : (
            <p className={styles.emptyNote}>Log something to see this fill in.</p>
          )}
        </div>
      </div>

      <div className={styles.dashboardTwoCol}>
        <div className={styles.chartCard}>
          <div className={styles.chartCardTitle}>{distanceUnit === "km" ? "Kilometres" : "Mileage"} over time</div>
          {mileagePoints.length > 0 ? (
            <MileageChart points={mileagePoints} distanceUnit={distanceUnit} />
          ) : (
            <p className={styles.emptyNote}>Log a couple of entries to see your mileage build up.</p>
          )}
        </div>
        <div className={styles.chartCard}>
          <div className={styles.chartCardTitle}>Recent activity</div>
          <RecentActivity items={recentActivity} distanceUnit={distanceUnit} currency={currency} rates={rates} />
        </div>
      </div>

      <ExportShareSection />
    </>
  );

  const serviceContent = (
    <>
      <h1 className={styles.heading}>Service</h1>
      <LogServiceForm initialMileage={bike.currentMileage} mileageHistory={mileagePoints} distanceUnit={distanceUnit} currency={currency} rates={rates} />
      <h2 className={styles.sectionHeading}>Service history</h2>
      {records.length === 0 ? (
        <div className={styles.card}><p className={styles.cardBody}>No service records logged yet. Log your first one above.</p></div>
      ) : (
        records.map((r) => (
          <ServiceHistoryCard key={r.id} record={r} bikeClass={bike.bikeClass} brandValue={brandValue} region={bike.region as Region} distanceUnit={distanceUnit} currency={currency} rates={rates} />
        ))
      )}
    </>
  );

  const fuelContent = (
    <>
      <h1 className={styles.heading}>Fuel</h1>
      <LogFuelForm initialMileage={bike.currentMileage} mileageHistory={mileagePoints} distanceUnit={distanceUnit} currency={currency} rates={rates} />
      {actualMpg ? (
        <p className={styles.subtext} style={{ marginBottom: "0.9rem" }}>
          Your actual average from logged fill-ups: <strong>{formatFuelEconomy(actualMpg, fuelEconomyUnit)}</strong> (the Cost Calculator assumes 57 mpg generally - this is specific to your bike and riding).
        </p>
      ) : (
        <p className={styles.subtext} style={{ marginBottom: "0.9rem" }}>Log at least two consecutive full-tank fill-ups to see your bike&apos;s real fuel economy here.</p>
      )}
      <h2 className={styles.sectionHeading}>Fuel log</h2>
      {fuelLogs.length === 0 ? (
        <div className={styles.card}><p className={styles.cardBody}>No fuel fill-ups logged yet. Log your first one above.</p></div>
      ) : (
        fuelLogs.map((f) => <FuelLogCard key={f.id} log={f} distanceUnit={distanceUnit} currency={currency} rates={rates} />)
      )}
    </>
  );

  const modsContent = (
    <>
      <h1 className={styles.heading}>Modifications & accessories</h1>
      <LogModForm initialMileage={bike.currentMileage} mileageHistory={mileagePoints} distanceUnit={distanceUnit} currency={currency} rates={rates} />
      <h2 className={styles.sectionHeading}>History</h2>
      {mods.length === 0 ? (
        <div className={styles.card}><p className={styles.cardBody}>No modifications or accessories logged yet.</p></div>
      ) : (
        mods.map((m) => <ModCard key={m.id} mod={m} distanceUnit={distanceUnit} currency={currency} rates={rates} />)
      )}
    </>
  );

  const billsContent = (
    <>
      <h1 className={styles.heading}>Insurance, tax & MOT</h1>
      <LogBillForm currency={currency} rates={rates} />
      <h2 className={styles.sectionHeading}>History</h2>
      {bills.length === 0 ? (
        <div className={styles.card}><p className={styles.cardBody}>No insurance, tax, or MOT payments logged yet.</p></div>
      ) : (
        bills.map((b) => <BillCard key={b.id} bill={b} currency={currency} rates={rates} />)
      )}
    </>
  );

  const remindersContent = (
    <>
      <h1 className={styles.heading}>Reminders</h1>
      {reminders.length === 0 ? (
        <div className={styles.card}><p className={styles.cardBody}>No reminders set yet. Tick &quot;Remind me&quot; when logging a service or a bill to add one.</p></div>
      ) : (
        reminders.map((r) => <ReminderItem key={r.id} reminder={r} status={computeReminderStatus(r, bike.currentMileage)} />)
      )}
    </>
  );

  const reportsContent = (
    <>
      <h1 className={styles.heading}>Reports</h1>
      <p className={styles.subtext} style={{ marginBottom: "1rem" }}>Every chart in one place.</p>
      <div className={styles.reportsGrid}>
        <div className={styles.chartCard}>
          <div className={styles.chartCardTitle}>{fuelEconomyUnit === "l100km" ? "Fuel economy" : "MPG"} over time</div>
          {mpgSeries.length > 0 ? <MpgChart series={mpgSeries} fuelEconomyUnit={fuelEconomyUnit} distanceUnit={distanceUnit} /> : <p className={styles.emptyNote}>Log two consecutive full-tank fill-ups to see this.</p>}
        </div>
        <div className={styles.chartCard}>
          <div className={styles.chartCardTitle}>Fuel cost over time</div>
          {fuelCostPoints.length > 0 ? <FuelCostChart points={fuelCostPoints} currency={currency} rates={rates} /> : <p className={styles.emptyNote}>Log a fuel fill-up to see cost trends here.</p>}
        </div>
        <div className={styles.chartCard}>
          <div className={styles.chartCardTitle}>Servicing spend over time</div>
          {serviceMonthly.length > 1 ? <CategorySpendChart data={serviceMonthly} color="#1a1a1a" currency={currency} rates={rates} /> : <p className={styles.emptyNote}>Check back once you&apos;ve logged servicing across a couple of months.</p>}
        </div>
        <div className={styles.chartCard}>
          <div className={styles.chartCardTitle}>Modifications spend over time</div>
          {modsMonthly.length > 1 ? <CategorySpendChart data={modsMonthly} color="#e8a33d" currency={currency} rates={rates} /> : <p className={styles.emptyNote}>Check back once you&apos;ve logged mods across a couple of months.</p>}
        </div>
        <div className={styles.chartCard}>
          <div className={styles.chartCardTitle}>Insurance, tax & MOT spend over time</div>
          {billsMonthly.length > 1 ? <CategorySpendChart data={billsMonthly} color="#6b5b95" currency={currency} rates={rates} /> : <p className={styles.emptyNote}>Check back once you&apos;ve logged bills across a couple of months.</p>}
        </div>
      </div>
    </>
  );

  return (
    <DashboardShell
      bikeName={bikeName}
      bikeYear={bike.year}
      currentMileage={bike.currentMileage}
      distanceUnit={distanceUnit}
      userEmail={session.email}
      dashboardContent={dashboardContent}
      serviceContent={serviceContent}
      fuelContent={fuelContent}
      modsContent={modsContent}
      billsContent={billsContent}
      remindersContent={remindersContent}
      reportsContent={reportsContent}
    />
  );
}
