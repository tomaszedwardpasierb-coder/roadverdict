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
import {
  formatDistance,
  formatFuelEconomy,
  formatCostPerDistance,
  convertMilesToDisplay,
  type DistanceUnit,
  type FuelEconomyUnit,
} from "@/lib/tracker/unitFormat";
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
import { DashboardTabs } from "./DashboardTabs";
import { BudgetWidget } from "./BudgetWidget";
import { SpendDonutChart } from "./SpendDonutChart";
import { MileageChart } from "./MileageChart";
import { MpgChart } from "./MpgChart";
import { FuelCostChart } from "./FuelCostChart";
import { CategorySpendChart } from "./CategorySpendChart";
import { UpdateMileageButton } from "./UpdateMileageButton";
import { type Currency } from "@/lib/tracker/currency";
import { getExchangeRates } from "@/lib/tracker/currencyRates";
import { UnitSettings } from "./UnitSettings";
import { ExportShareSection } from "./ExportShareSection";

export const dynamic = "force-dynamic";

function fmtMoney(n: number): string {
  return `£${n.toFixed(0)}`;
}

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

  const serviceContent = (
    <>
      <LogServiceForm initialMileage={bike.currentMileage} mileageHistory={mileagePoints} distanceUnit={distanceUnit} currency={currency} rates={rates} />
      <div className={styles.chartCard} style={{ marginBottom: "0.9rem" }}>
        <div className={styles.chartCardTitle}>Servicing spend over time</div>
        {serviceMonthly.length > 1 ? (
          <CategorySpendChart data={serviceMonthly} color="#1a1a1a" />
        ) : (
          <p className={styles.emptyNote}>Check back once you&apos;ve logged servicing across a couple of months.</p>
        )}
      </div>
      <h2 className={styles.sectionHeading}>Service history</h2>
      {records.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.cardBody}>No service records logged yet. Log your first one above.</p>
        </div>
      ) : (
        records.map((r) => (
          <ServiceHistoryCard
            key={r.id}
            record={r}
            bikeClass={bike.bikeClass}
            brandValue={brandValue}
            region={bike.region as Region}
            distanceUnit={distanceUnit}
          />
        ))
      )}
    </>
  );

  const fuelContent = (
    <>
      <LogFuelForm initialMileage={bike.currentMileage} mileageHistory={mileagePoints} distanceUnit={distanceUnit} currency={currency} rates={rates} />
      {actualMpg ? (
        <p className={styles.subtext} style={{ marginBottom: "0.9rem" }}>
          Your actual average from logged fill-ups: <strong>{formatFuelEconomy(actualMpg, fuelEconomyUnit)}</strong>{" "}
          (the Cost Calculator assumes 57 mpg generally - this is specific to your bike and riding).
        </p>
      ) : (
        <p className={styles.subtext} style={{ marginBottom: "0.9rem" }}>
          Log at least two consecutive full-tank fill-ups to see your bike&apos;s real fuel economy here.
        </p>
      )}

      <div className={styles.chartCard} style={{ marginBottom: "0.9rem" }}>
        <div className={styles.chartCardTitle}>{fuelEconomyUnit === "l100km" ? "Fuel economy" : "MPG"} over time</div>
        {mpgSeries.length > 0 ? (
          <MpgChart series={mpgSeries} fuelEconomyUnit={fuelEconomyUnit} distanceUnit={distanceUnit} />
        ) : (
          <p className={styles.emptyNote}>Log two consecutive full-tank fill-ups to see this.</p>
        )}
      </div>

      <div className={styles.chartCard} style={{ marginBottom: "0.9rem" }}>
        <div className={styles.chartCardTitle}>Fuel cost over time</div>
        {fuelCostPoints.length > 0 ? (
          <FuelCostChart points={fuelCostPoints} />
        ) : (
          <p className={styles.emptyNote}>Log a fuel fill-up to see cost trends here.</p>
        )}
      </div>

      <h2 className={styles.sectionHeading}>Fuel log</h2>
      {fuelLogs.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.cardBody}>No fuel fill-ups logged yet. Log your first one above.</p>
        </div>
      ) : (
        fuelLogs.map((f) => <FuelLogCard key={f.id} log={f} distanceUnit={distanceUnit} />)
      )}
    </>
  );

  const modsContent = (
    <>
      <LogModForm initialMileage={bike.currentMileage} mileageHistory={mileagePoints} distanceUnit={distanceUnit} currency={currency} rates={rates} />
      <div className={styles.chartCard} style={{ marginBottom: "0.9rem" }}>
        <div className={styles.chartCardTitle}>Modifications spend over time</div>
        {modsMonthly.length > 1 ? (
          <CategorySpendChart data={modsMonthly} color="#e8a33d" />
        ) : (
          <p className={styles.emptyNote}>Check back once you&apos;ve logged mods across a couple of months.</p>
        )}
      </div>
      <h2 className={styles.sectionHeading}>Modifications & accessories</h2>
      {mods.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.cardBody}>No modifications or accessories logged yet.</p>
        </div>
      ) : (
        mods.map((m) => <ModCard key={m.id} mod={m} distanceUnit={distanceUnit} />)
      )}
    </>
  );

  const billsContent = (
    <>
      <LogBillForm currency={currency} rates={rates} />
      <div className={styles.chartCard} style={{ marginBottom: "0.9rem" }}>
        <div className={styles.chartCardTitle}>Insurance, tax & MOT spend over time</div>
        {billsMonthly.length > 1 ? (
          <CategorySpendChart data={billsMonthly} color="#6b5b95" />
        ) : (
          <p className={styles.emptyNote}>Check back once you&apos;ve logged bills across a couple of months.</p>
        )}
      </div>
      <h2 className={styles.sectionHeading}>Insurance, tax & MOT</h2>
      {bills.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.cardBody}>No insurance, tax, or MOT payments logged yet.</p>
        </div>
      ) : (
        bills.map((b) => <BillCard key={b.id} bill={b} />)
      )}
    </>
  );

  const remindersContent = (
    <>
      <h2 className={styles.sectionHeading} style={{ marginTop: 0 }}>Reminders</h2>
      {reminders.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.cardBody}>
            No reminders set yet. Tick &quot;Remind me&quot; when logging a service or a bill to add one.
          </p>
        </div>
      ) : (
        reminders.map((r) => (
          <ReminderItem key={r.id} reminder={r} status={computeReminderStatus(r, bike.currentMileage)} />
        ))
      )}
    </>
  );

  return (
    <main className={styles.main}>
      {overBudget && (
        <div className={styles.budgetWarningBanner}>
          ⚠️ <strong>You&apos;re over your {currentYear} budget</strong> - {fmtMoney(yearSpend)} spent against a{" "}
          {fmtMoney(bike.annualBudget as number)} budget, {fmtMoney(yearSpend - (bike.annualBudget as number))} over.
        </div>
      )}

      <div className={styles.dashboardTopBar}>
        <h1 className={styles.heading} style={{ margin: 0 }}>
          {bike.nickname ? `${bike.nickname} — ${bike.make} ${bike.model}` : `${bike.make} ${bike.model}`}
        </h1>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
          <UpdateMileageButton currentMileage={bike.currentMileage} distanceUnit={distanceUnit} />
          <LogoutButton />
        </div>
      </div>
      <p className={styles.subtext}>
        {bike.year} · {bike.engineCC}cc ({bike.bikeClass}) · {formatDistance(bike.currentMileage, distanceUnit)}
      </p>

      <div style={{ marginBottom: "1rem" }}>
        <UnitSettings distanceUnit={distanceUnit} fuelEconomyUnit={fuelEconomyUnit} currency={currency} />
      </div>

      <div className={styles.statsStrip}>
        <div className={styles.statCard}>
          <div className={styles.statCardValue}>{fmtMoney(summary.grandTotal)}</div>
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
          <div className={styles.statCardValue}>
            {Math.round(convertMilesToDisplay(bike.currentMileage, distanceUnit)).toLocaleString()}
          </div>
          <div className={styles.statCardLabel}>Current {distanceUnit === "km" ? "km" : "miles"}</div>
        </div>
      </div>

      <BudgetWidget yearSpend={yearSpend} currentYear={currentYear} initialBudget={bike.annualBudget} />

      <div className={styles.chartsGrid}>
        <div className={styles.chartCard}>
          <div className={styles.chartCardTitle}>Spend by category</div>
          {summary.grandTotal > 0 ? (
            <SpendDonutChart
              servicingTotal={summary.servicingTotal}
              modsTotal={summary.modsTotal}
              fuelTotal={summary.fuelTotal}
              billsTotal={summary.billsTotal}
            />
          ) : (
            <p className={styles.emptyNote}>Log something to see this fill in.</p>
          )}
        </div>
        <div className={styles.chartCard}>
          <div className={styles.chartCardTitle}>{distanceUnit === "km" ? "Kilometres" : "Mileage"} over time</div>
          {mileagePoints.length > 0 ? (
            <MileageChart points={mileagePoints} distanceUnit={distanceUnit} />
          ) : (
            <p className={styles.emptyNote}>Log a couple of entries to see your mileage build up.</p>
          )}
        </div>
      </div>

      <ExportShareSection />

      <DashboardTabs
        serviceContent={serviceContent}
        fuelContent={fuelContent}
        modsContent={modsContent}
        billsContent={billsContent}
        remindersContent={remindersContent}
      />
    </main>
  );
}



