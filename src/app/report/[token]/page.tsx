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
import { isBackdated, backdateNotice, detectBulkBackdating, type BackdateCheckItem } from "@/lib/tracker/backdateCheck";
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
  const resolved = await resolveShareToken(params.token);
  if (!resolved) notFound();
  const { email, bikeId } = resolved;

  const bike = await getBike(email, bikeId);
  if (!bike) notFound();

  const [records, mods, bills] = await Promise.all([
    getServiceRecords(email, bikeId),
    getMods(email, bikeId),
    getBills(email, bikeId),
  ]);

  interface Row {
    id: string;
    date: string;
    createdAt: string;
    category: string;
    description: string;
    cost: number;
    hasAttachment: boolean;
  }

  const rows: Row[] = [
    ...records.map((r) => ({ id: r.id, date: r.date, createdAt: r.createdAt, category: "Service", description: JOB_LABELS[r.jobType] ?? r.jobType, cost: r.cost, hasAttachment: !!r.attachments?.[0] })),
    ...mods.map((m) => ({ id: m.id, date: m.date, createdAt: m.createdAt, category: "Modification", description: `${MOD_LABELS[m.category] ?? m.category}: ${m.name}`, cost: m.cost, hasAttachment: !!m.attachments?.[0] })),
    ...bills.map((b) => ({ id: b.id, date: b.date, createdAt: b.createdAt, category: "Bill", description: BILL_LABELS[b.billType] ?? b.billType, cost: b.cost, hasAttachment: !!b.attachments?.[0] })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const total = rows.reduce((sum, r) => sum + r.cost, 0);

  // Same tamper-resistant signal throughout: `createdAt` is set
  // server-side at creation and can never be edited by the client, so
  // comparing it against the user-claimed `date` is meaningful in a way
  // that neither field alone would be.
  const backdateItems: BackdateCheckItem[] = rows.map((r) => ({ id: r.id, date: r.date, createdAt: r.createdAt, hasAttachment: r.hasAttachment }));
  const clusters = detectBulkBackdating(backdateItems);
  const backdatedCount = rows.filter((r) => isBackdated(r.date, r.createdAt)).length;
  const realTimeCount = rows.length - backdatedCount;

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

      {clusters.length > 0 && (
        <div className={styles.clusterWarning}>
          {clusters.map((c, i) => (
            <p key={i}>
              ⚠️ {c.count} entries - covering {fmtDate(c.earliestClaimedDate)} to {fmtDate(c.latestClaimedDate)}, {c.spanDays} days
              of claimed history - were all logged on RoadVerdict within the same hour, on {fmtDate(c.loggedAt)}. Worth asking the
              seller about this.
            </p>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p>No service, modification, or bill history has been logged for this bike yet.</p>
      ) : (
        <>
          {backdatedCount > 0 && (
            <p className={styles.backdateSummary}>
              {realTimeCount} of {rows.length} entries were logged close to when the work was done. {backdatedCount}{" "}
              {backdatedCount === 1 ? "was" : "were"} added to RoadVerdict later than the date claimed - see the notes below
              each one.
            </p>
          )}
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
              {rows.map((r) => {
                const backdated = isBackdated(r.date, r.createdAt);
                const notice = backdated ? backdateNotice(r.date, r.createdAt) : "";
                return (
                  <tr key={r.id}>
                    <td>
                      {fmtDate(r.date)}
                      {backdated && (
                        <div className={r.hasAttachment ? styles.backdateNoteSoft : styles.backdateNote}>
                          {notice}
                          {r.hasAttachment && " (receipt attached)"}
                        </div>
                      )}
                    </td>
                    <td>{r.category}</td>
                    <td>{r.description}</td>
                    <td>{fmtMoney(r.cost)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total logged spend</td>
                <td>{fmtMoney(total)}</td>
              </tr>
            </tfoot>
          </table>
        </>
      )}

      <p className={styles.caveat}>
        This history is self-reported by the bike&apos;s owner via RoadVerdict and has not been
        independently verified against DVSA MOT records. "Logged after the claimed date" notes reflect
        when an entry was actually added to RoadVerdict, compared with the date the owner said the work
        was done - a gap here isn&apos;t necessarily dishonest (people digitise old paper receipts all
        the time), but it&apos;s a fact worth knowing before you rely on this history. Fuel spend is not
        included, since it isn&apos;t relevant to a buyer. Generated {fmtDate(new Date().toISOString())}.
      </p>
    </div>
  );
}
