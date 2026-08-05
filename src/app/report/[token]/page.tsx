// Place at: src/app/report/[token]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveShareToken } from "@/lib/tracker/shareLink";
import { getSellerReportData } from "@/lib/tracker/sellerReportData";
import { hasReportAccess } from "@/lib/tracker/reportAccess";
import { PlateGate } from "./PlateGate";
import { ReportHistoryTable } from "./ReportHistoryTable";
import styles from "./report.module.css";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// The free, default view - the raw logged history, exactly as before
// the verdict/upcoming-costs/questions work. The detailed report (its
// own separate route) is the paid upsell: a distinct destination, not a
// toggle on this page, so gating it later never means touching this one.
export default async function SaleReportPage({ params }: { params: { token: string } }) {
  // Checked before deciding whether to show the plate gate, so a bogus
  // or expired token gets a real 404 immediately rather than a gate
  // form that would only fail later, once someone bothers to guess a plate.
  if (!(await resolveShareToken(params.token))) notFound();

  const verified = await hasReportAccess(params.token);
  if (!verified) return <PlateGate token={params.token} />;

  const data = await getSellerReportData(params.token);
  const { bike, rows, total, clusters, backdatedCount, realTimeCount, receiptCount, currentRegistration, registrationChangesCount, originalRegistration, mostRecentChangeDate, daysSinceLastChange, dateAdded } = data;

  return (
    <div className={styles.wrapper}>
      <div className={styles.noPrint} style={{ marginBottom: "1.2rem" }}>
        <PrintButton />
      </div>
      <h1 className={styles.title}>
        {bike.nickname ? `${bike.nickname} — ${bike.make} ${bike.model}` : `${bike.make} ${bike.model}`}
      </h1>
      <p className={styles.subtext}>
        {bike.isCustomBuild ? "Custom build" : bike.year} · {bike.engineCC}cc · {bike.currentMileage.toLocaleString()} miles
      </p>

      <div className={styles.upsellBlock}>
        <div>
          <p className={styles.upsellTitle}>Buyer Verdict Report</p>
          <p className={styles.upsellText}>
            A documentation-quality verdict, what a new owner should budget for soon, and specific questions worth
            asking - all drawn from the same history below.
          </p>
        </div>
        <Link href={`/report/${params.token}/detailed`} className="submit-button" style={{ textDecoration: "none", flexShrink: 0 }}>
          Get the Buyer Verdict Report
        </Link>
      </div>

      <div className={styles.registrationBlock}>
        {currentRegistration ? (
          <>
            <p>
              {registrationChangesCount === 0 ? (
                <>Registered as <strong>{currentRegistration}</strong> since being added to RoadVerdict on {fmtDate(dateAdded)}.</>
              ) : (
                <>
                  Originally registered as <strong>{originalRegistration}</strong> (added to RoadVerdict {fmtDate(dateAdded)}),
                  currently <strong>{currentRegistration}</strong> (since {fmtDate(mostRecentChangeDate!)}).
                </>
              )}
            </p>
            {registrationChangesCount >= 2 && (
              <p className={styles.registrationNote}>
                This bike&apos;s registration has been changed {registrationChangesCount} times since being added to RoadVerdict.
              </p>
            )}
            {daysSinceLastChange !== null && daysSinceLastChange <= 30 && (
              <p className={styles.registrationWarning}>
                ⚠️ Registration changed to {currentRegistration} on {fmtDate(mostRecentChangeDate!)} - just {daysSinceLastChange}{" "}
                day{daysSinceLastChange === 1 ? "" : "s"} before this report was generated.
              </p>
            )}
          </>
        ) : (
          <p className={styles.registrationNote}>No registration number is on record for this bike.</p>
        )}
      </div>

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

      <ReportHistoryTable
        rows={rows}
        total={total}
        bike={bike}
        token={params.token}
        backdatedCount={backdatedCount}
        realTimeCount={realTimeCount}
        receiptCount={receiptCount}
        approvedEntryIds={data.approvedEntryIds}
      />

      <p className={styles.caveat}>
        This history is self-reported by the bike&apos;s owner and has not been independently verified against DVSA
        MOT records. &quot;Logged after the claimed date&quot; notes reflect when an entry was actually added to
        RoadVerdict, compared with the date the owner said the work was done - a gap here isn&apos;t necessarily
        dishonest (people digitise old paper receipts all the time), but it&apos;s a fact worth knowing before you
        rely on this history. Fuel spend is not included, since it isn&apos;t relevant to a buyer. Generated {fmtDate(new Date().toISOString())}.
      </p>
    </div>
  );
}
