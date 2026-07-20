// Place at: src/app/dashboard/page.tsx
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import styles from "./dashboard.module.css";
import LogoutButton from "./LogoutButton";
import { getBike } from "@/lib/tracker/bike";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getFuelLogs, computeActualMPG } from "@/lib/tracker/fuelLog";
import { getMods } from "@/lib/tracker/mod";
import { getBills } from "@/lib/tracker/bill";
import { getReminders, computeReminderStatus } from "@/lib/tracker/reminder";
import { slugifyMake } from "@/lib/motorcycleModels";
import type { Region } from "@/lib/priceData";
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

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const bike = await getBike(session.email);

  if (!bike) {
    return (
      <div className={styles.wrapper}>
        <header className={styles.header}>
          <img src="/logo.png" alt="RoadVerdict" className={styles.logoImg} />
          <LogoutButton />
        </header>
        <main className={styles.main}>
          <h1 className={styles.heading}>Add your bike</h1>
          <p className={styles.subtext}>Signed in as {session.email}.</p>
          <AddBikeForm />
        </main>
      </div>
    );
  }

  if (!bike.region) {
    return (
      <div className={styles.wrapper}>
        <header className={styles.header}>
          <img src="/logo.png" alt="RoadVerdict" className={styles.logoImg} />
          <LogoutButton />
        </header>
        <main className={styles.main}>
          <h1 className={styles.heading}>
            {bike.nickname ? `${bike.nickname} — ${bike.make} ${bike.model}` : `${bike.make} ${bike.model}`}
          </h1>
          <SetRegionForm />
        </main>
      </div>
    );
  }

  const [records, fuelLogs, mods, bills, reminders] = await Promise.all([
    getServiceRecords(session.email),
    getFuelLogs(session.email),
    getMods(session.email),
    getBills(session.email),
    getReminders(session.email),
  ]);
  const brandValue = slugifyMake(bike.make);
  const actualMpg = computeActualMPG(fuelLogs);

  const serviceContent = (
    <>
      <LogServiceForm initialMileage={bike.currentMileage} />
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
          />
        ))
      )}
    </>
  );

  const fuelContent = (
    <>
      <LogFuelForm initialMileage={bike.currentMileage} />
      <h2 className={styles.sectionHeading}>Fuel log</h2>
      {actualMpg ? (
        <p className={styles.subtext} style={{ marginBottom: "0.9rem" }}>
          Your actual average from logged fill-ups: <strong>{actualMpg.toFixed(1)} mpg</strong> (the Cost
          Calculator assumes 57 mpg generally - this is specific to your bike and riding).
        </p>
      ) : (
        <p className={styles.subtext} style={{ marginBottom: "0.9rem" }}>
          Log at least two consecutive full-tank fill-ups to see your bike&apos;s real MPG here.
        </p>
      )}
      {fuelLogs.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.cardBody}>No fuel fill-ups logged yet. Log your first one above.</p>
        </div>
      ) : (
        fuelLogs.map((f) => <FuelLogCard key={f.id} log={f} />)
      )}
    </>
  );

  const modsContent = (
    <>
      <LogModForm initialMileage={bike.currentMileage} />
      <h2 className={styles.sectionHeading}>Modifications & accessories</h2>
      {mods.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.cardBody}>No modifications or accessories logged yet.</p>
        </div>
      ) : (
        mods.map((m) => <ModCard key={m.id} mod={m} />)
      )}
    </>
  );

  const billsContent = (
    <>
      <LogBillForm />
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
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <img src="/logo.png" alt="RoadVerdict" className={styles.logoImg} />
        <LogoutButton />
      </header>

      <main className={styles.main}>
        <h1 className={styles.heading}>
          {bike.nickname ? `${bike.nickname} — ${bike.make} ${bike.model}` : `${bike.make} ${bike.model}`}
        </h1>
        <p className={styles.subtext}>
          {bike.year} · {bike.engineCC}cc ({bike.bikeClass}) · {bike.currentMileage.toLocaleString()} miles
        </p>

        <DashboardTabs
          serviceContent={serviceContent}
          fuelContent={fuelContent}
          modsContent={modsContent}
          billsContent={billsContent}
          remindersContent={remindersContent}
        />
      </main>
    </div>
  );
}
