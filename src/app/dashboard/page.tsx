// Place at: src/app/dashboard/page.tsx
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import styles from "./dashboard.module.css";
import LogoutButton from "./LogoutButton";
import { getBike } from "@/lib/tracker/bike";
import { getServiceRecords, type ServiceRecordDoc } from "@/lib/tracker/serviceRecord";
import { getFuelLogs, computeActualMPG, type FuelLogDoc } from "@/lib/tracker/fuelLog";
import { getAdjustedBenchmark, type BikeClass, type Region } from "@/lib/priceData";
import { slugifyMake } from "@/lib/motorcycleModels";
import { AFFILIATE_LINKS, isBenchmarkedJob, JOB_LABELS } from "@/lib/tracker/jobTypes";
import { AddBikeForm } from "./AddBikeForm";
import { SetRegionForm } from "./SetRegionForm";
import { LogServiceForm } from "./LogServiceForm";
import { LogFuelForm } from "./LogFuelForm";

export const dynamic = "force-dynamic";

function fmtMoney(n: number): string {
  return `£${n.toFixed(0)}`;
}
function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

interface Verdict {
  label: string;
  cls: "fair" | "high" | "second-opinion";
  low: number;
  high: number;
}

function computeVerdict(
  jobType: string,
  bikeClass: BikeClass,
  brandValue: string,
  region: Region,
  cost: number
): Verdict | null {
  if (!isBenchmarkedJob(jobType)) return null;
  const bench = getAdjustedBenchmark(jobType, bikeClass, brandValue, region);
  if (cost <= bench.high) return { label: "Fair", cls: "fair", low: bench.low, high: bench.high };
  if (cost <= bench.high * 1.25) return { label: "High", cls: "high", low: bench.low, high: bench.high };
  return { label: "Second opinion", cls: "second-opinion", low: bench.low, high: bench.high };
}

function ServiceHistoryCard({ record, verdict }: { record: ServiceRecordDoc; verdict: Verdict | null }) {
  const jobLabel = JOB_LABELS[record.jobType] ?? record.jobType;
  const affiliate = AFFILIATE_LINKS[record.jobType];
  const tagClass =
    verdict?.cls === "fair" ? styles.tagFair : verdict?.cls === "high" ? styles.tagHigh : styles.tagSecondOpinion;

  return (
    <div className={styles.jobCard}>
      <div className={styles.jobCardTop}>
        <span className={styles.jobCardJob}>{jobLabel}</span>
        <span className={styles.jobCardCost}>{fmtMoney(record.cost)}</span>
      </div>
      <div className={styles.jobCardMeta}>
        {fmtDate(record.date)} · {record.mileage.toLocaleString()} miles
      </div>
      {record.notes && <div className={styles.jobCardNotes}>{record.notes}</div>}
      {verdict && (
        <span className={`${styles.tag} ${tagClass}`}>
          {verdict.label} (typical £{verdict.low}-{verdict.high})
        </span>
      )}
      {affiliate && (
        <div className={styles.affiliateNudge}>
          Need parts for next time?{" "}
          {affiliate.map((a) => (
            <a key={a.url} href={a.url} target="_blank" rel="noopener">{a.name}</a>
          ))}
        </div>
      )}
    </div>
  );
}

function FuelLogCard({ log }: { log: FuelLogDoc }) {
  const perLitre = (log.cost / log.litres).toFixed(2);
  return (
    <div className={styles.jobCard}>
      <div className={styles.jobCardTop}>
        <span className={styles.jobCardJob}>{log.litres.toFixed(1)} L{log.filledToFull ? " (full tank)" : ""}</span>
        <span className={styles.jobCardCost}>{fmtMoney(log.cost)}</span>
      </div>
      <div className={styles.jobCardMeta}>
        {fmtDate(log.date)} · {log.mileage.toLocaleString()} miles · {perLitre}p/litre
      </div>
    </div>
  );
}

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
              verdict={computeVerdict(r.jobType, bike.bikeClass, brandValue, bike.region as Region, r.cost)}
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
