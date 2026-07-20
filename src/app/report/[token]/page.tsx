// Place at: src/app/report/[token]/page.tsx
import { notFound } from "next/navigation";
import { resolveShareToken } from "@/lib/tracker/shareLink";
import { getBike } from "@/lib/tracker/bike";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getMods } from "@/lib/tracker/mod";
import { getBills } from "@/lib/tracker/bill";
import { JOB_LABELS } from "@/lib/tracker/jobTypes";
import { MOD_LABELS } from "@/lib/tracker/modTypes";
import { BILL_LABELS } from "@/lib/tracker/billTypes";
import styles from "./report.module.css";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

function fmtMoney(n: number): string {
  return `£${n.toFixed(2)}`;
}
function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function SaleReportPage({ params }: { params: { token: string } }) {
  const email = await resolveShareToken(params.token);
  if (!email) notFound();

  const bike = await getBike(email);
  if (!bike) notFound();

  const [records, mods, bills] = await Promise.all([
    getServiceRecords(email),
    getMods(email),
    getBills(email),
  ]);

  interface Row {
    date: string;
    category: string;
    description: string;
    cost: number;
  }

  const rows: Row[] = [
    ...records.map((r) => ({ date: r.date, category: "Service", description: JOB_LABELS[r.jobType] ?? r.jobType, cost: r.cost })),
    ...mods.map((m) => ({ date: m.date, category: "Modification", description: `${MOD_LABELS[m.category] ?? m.category}: ${m.name}`, cost: m.cost })),
    ...bills.map((b) => ({ date: b.date, category: "Bill", description: BILL_LABELS[b.billType] ?? b.billType, cost: b.cost })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const total = rows.reduce((sum, r) => sum + r.cost, 0);

  return (
    <div className={styles.wrapper}>
      <div className={styles.noPrint} style={{ marginBottom: "1.2rem" }}>
        <PrintButton />
      </div>
      <h1 className={styles.title}>
        {bike.nickname ? `${bike.nickname} — ${bike.make} ${bike.model}` : `${bike.make} ${bike.model}`}
      </h1>
      <p className={styles.subtext}>
        {bike.year} · {bike.engineCC}cc · {bike.currentMileage.toLocaleString()} miles
      </p>

      {rows.length === 0 ? (
        <p>No service, modification, or bill history has been logged for this bike yet.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Description</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{fmtDate(r.date)}</td>
                <td>{r.category}</td>
                <td>{r.description}</td>
                <td>{fmtMoney(r.cost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Total logged spend</td>
              <td>{fmtMoney(total)}</td>
            </tr>
          </tfoot>
        </table>
      )}

      <p className={styles.caveat}>
        This history is self-reported by the bike&apos;s owner via RoadVerdict and has not been
        independently verified against DVSA MOT records. Fuel spend is not included, since it
        isn&apos;t relevant to a buyer. Generated {fmtDate(new Date().toISOString())}.
      </p>
    </div>
  );
}
