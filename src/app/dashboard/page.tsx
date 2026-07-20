// Place at: src/app/dashboard/page.tsx
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import styles from "./dashboard.module.css";
import LogoutButton from "./LogoutButton";
import { getBike } from "@/lib/tracker/bike";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getFuelLogs, computeActualMPG } from "@/lib/tracker/fuelLog";
import { slugifyMake } from "@/lib/motorcycleModels";
import type { Region } from "@/lib/priceData";
import { AddBikeForm } from "./AddBikeForm";
import { SetRegionForm } from "./SetRegionForm";
import { LogServiceForm } from "./LogServiceForm";
import { LogFuelForm } from "./LogFuelForm";
import { ServiceHistoryCard } from "./ServiceHistoryCard";
import { FuelLogCard } from "./FuelLogCard";

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

  const [records, fuelLogs] = await Promise.all([
    getServiceRecords(session.email),
    getFuelLogs(session.email),
  ]);
  const brandValue = slugifyMake(bike.make);
  const actualMpg = computeActualMPG(fuelLogs);

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

        <LogServiceForm initialMileage={bike.currentMileage} />

        <h2 className={styles.cardTitle} style={{ marginTop: "1.5rem" }}>Service history</h2>
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

        <div style={{ marginTop: "2rem" }}>
          <LogFuelForm initialMileage={bike.currentMileage} />
        </div>

        <h2 className={styles.cardTitle} style={{ marginTop: "1.5rem" }}>Fuel log</h2>
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
      </main>
    </div>
  );
}
