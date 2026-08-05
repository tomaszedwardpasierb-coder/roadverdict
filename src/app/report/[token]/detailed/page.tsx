// Place at: src/app/report/[token]/detailed/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveShareToken } from "@/lib/tracker/shareLink";
import { getSellerReportData } from "@/lib/tracker/sellerReportData";
import { hasReportAccess } from "@/lib/tracker/reportAccess";
import { PlateGate } from "../PlateGate";
import { reminderDetailLabel } from "@/lib/tracker/reminderStatus";
import { ReportHistoryTable } from "../ReportHistoryTable";
import QRCode from "qrcode";
import styles from "../report.module.css";
import { PrintButton } from "../PrintButton";

export const dynamic = "force-dynamic";

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// The paid upsell - a genuinely separate route on purpose, not a toggle
// on the basic report, so gating this behind payment later is a change
// to this one file, not a rework of the free page everyone lands on
// first. Free while in beta; the boundary is already drawn.
export default async function DetailedReportPage({ params }: { params: { token: string } }) {
  if (!(await resolveShareToken(params.token))) notFound();

  const verified = await hasReportAccess(params.token);
  if (!verified) return <PlateGate token={params.token} />;

  const data = await getSellerReportData(params.token);
  const {
    bike, rows, total, backdatedCount, realTimeCount, receiptCount,
    currentRegistration, verdict, buyerQuestions, upcomingReminders,
    consumablesDueSoon, motCheckUrl,
  } = data;

  const verdictBadgeClass =
    verdict.tier === "well-documented" ? styles.verdictGood : verdict.tier === "partially-documented" ? styles.verdictMid : styles.verdictPoor;

  // Points at this exact page's own live URL - a printed copy handed
  // over at an in-person viewing can be scanned to confirm it matches
  // what's actually hosted, not something edited after printing.
  const canonicalReportUrl = `${process.env.APP_URL ?? "https://roadverdict.co.uk"}/report/${params.token}/detailed`;
  const qrDataUrl = await QRCode.toDataURL(canonicalReportUrl, { margin: 1, width: 160 });

  return (
    <div className={styles.wrapper}>
      <div className={styles.noPrint} style={{ marginBottom: "1.2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link href={`/report/${params.token}`} className={styles.backLink}>← Back to summary</Link>
        <PrintButton />
      </div>

      <h1 className={styles.title}>
        {bike.nickname ? `${bike.nickname} — ${bike.make} ${bike.model}` : `${bike.make} ${bike.model}`}
      </h1>
      <p className={styles.subtext}>
        {bike.isCustomBuild ? "Custom build" : bike.year} · {bike.engineCC}cc · {bike.currentMileage.toLocaleString()} miles
      </p>
      <p className={styles.upsellFlag}>Buyer Verdict Report</p>

      <div className={`${styles.verdictBlock} ${verdictBadgeClass}`}>
        <span className={styles.verdictBadge}>{verdict.label}</span>
        <ul className={styles.verdictReasons}>
          {verdict.reasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
      </div>

      <div className={styles.verifyBlock}>
        <div>
          <p className={styles.verifyText}>
            Cross-check this against the government&apos;s own record - independent of anything RoadVerdict shows.
          </p>
          <a href={motCheckUrl} target="_blank" rel="noopener" className={styles.motLink}>
            Check MOT history on GOV.UK ↗
          </a>
          {currentRegistration && <p className={styles.verifyPlate}>Registration: <strong>{currentRegistration}</strong></p>}
        </div>
        <div className={styles.qrBlock}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="Scan to open the live version of this report" width={110} height={110} />
          <p className={styles.qrCaption}>Scan to confirm this is the live report, not an edited copy</p>
        </div>
      </div>

      {(upcomingReminders.length > 0 || consumablesDueSoon.length > 0) && (
        <div className={styles.upcomingBlock}>
          <p className={styles.upcomingTitle}>What a new owner should budget for soon</p>
          <ul className={styles.upcomingList}>
            {upcomingReminders.map(({ reminder, status }) => (
              <li key={reminder.id} className={status === "overdue" ? styles.upcomingOverdue : styles.upcomingSoon}>
                {reminder.name} - {reminderDetailLabel(reminder)}
                {status === "overdue" ? " (overdue)" : ""}
              </li>
            ))}
            {consumablesDueSoon.map((c) => (
              <li key={c.jobType} className={c.status === "overdue" ? styles.upcomingOverdue : styles.upcomingSoon}>
                {c.label} - last done at {c.lastDoneMileage.toLocaleString()} mi
                {c.intervalMiles ? `, typically due again every ${c.intervalMiles.toLocaleString()} mi` : ""}
                {c.status === "overdue" ? " (likely overdue by now)" : " (likely due soon)"}
              </li>
            ))}
          </ul>
          <p className={styles.upcomingNote}>
            Based on this bike&apos;s own logged intervals, not a generic assumption - inferred from what&apos;s
            actually been recorded, so treat it as a helpful estimate rather than a guarantee.
          </p>
        </div>
      )}

      <div className={styles.questionsBlock}>
        <p className={styles.questionsTitle}>Questions worth asking before you buy</p>
        <ol className={styles.questionsList}>
          {buyerQuestions.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ol>
      </div>

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
        The badge above reflects how completely this bike&apos;s history has been documented on RoadVerdict - it is
        not a judgement of the owner. This history is self-reported and has not been independently verified against
        DVSA MOT records. Fuel spend is not included, since it isn&apos;t relevant to a buyer.
        Generated {fmtDate(new Date().toISOString())}.
      </p>
    </div>
  );
}
