// Place at: src/app/report/[token]/page.tsx
import { notFound } from "next/navigation";
import { resolveShareToken } from "@/lib/tracker/shareLink";
import { getBike, getCurrentRegistration } from "@/lib/tracker/bike";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getMods } from "@/lib/tracker/mod";
import { getBills } from "@/lib/tracker/bill";
import { getFuelLogs } from "@/lib/tracker/fuelLog";
import { getReminders } from "@/lib/tracker/reminder";
import { computeReminderStatus, reminderDetailLabel } from "@/lib/tracker/reminderStatus";
import { findMileageMonotonicityViolations } from "@/lib/tracker/mileageAudit";
import { computeSellerVerdict, type SellerVerdictMetrics } from "@/lib/tracker/sellerReportVerdict";
import { generateBuyerQuestions } from "@/lib/tracker/reportQuestions";
import { findConsumablesDueSoon } from "@/lib/tracker/consumablesDueSoon";
import QRCode from "qrcode";
import { JOB_LABELS } from "@/lib/tracker/jobTypes";
import { MOD_LABELS } from "@/lib/tracker/modTypes";
import { BILL_LABELS } from "@/lib/tracker/billTypes";
import { isBackdated, backdateNotice, detectBulkBackdating, type BackdateCheckItem } from "@/lib/tracker/backdateCheck";
import { isBeforeProduction } from "@/lib/tracker/productionYearCheck";
import type { Attachment } from "@/lib/tracker/cosmosHelpers";
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

  const [records, mods, bills, fuelLogs, reminders] = await Promise.all([
    getServiceRecords(email, bikeId),
    getMods(email, bikeId),
    getBills(email, bikeId),
    getFuelLogs(email, bikeId),
    getReminders(email, bikeId),
  ]);

  interface Row {
    id: string;
    date: string;
    createdAt: string;
    category: string;
    description: string;
    cost: number;
    attachment: Attachment | null;
  }

  const rows: Row[] = [
    ...records.map((r) => ({ id: r.id, date: r.date, createdAt: r.createdAt, category: "Service", description: JOB_LABELS[r.jobType] ?? r.jobType, cost: r.cost, attachment: r.attachments?.[0] ?? null })),
    ...mods.map((m) => ({ id: m.id, date: m.date, createdAt: m.createdAt, category: "Modification", description: `${MOD_LABELS[m.category] ?? m.category}: ${m.name}`, cost: m.cost, attachment: m.attachments?.[0] ?? null })),
    ...bills.map((b) => ({ id: b.id, date: b.date, createdAt: b.createdAt, category: "Bill", description: BILL_LABELS[b.billType] ?? b.billType, cost: b.cost, attachment: b.attachments?.[0] ?? null })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const total = rows.reduce((sum, r) => sum + r.cost, 0);

  // Same tamper-resistant signal throughout: `createdAt` is set
  // server-side at creation and can never be edited by the client, so
  // comparing it against the user-claimed `date` is meaningful in a way
  // that neither field alone would be.
  const backdateItems: BackdateCheckItem[] = rows.map((r) => ({ id: r.id, date: r.date, createdAt: r.createdAt, hasAttachment: !!r.attachment }));
  const clusters = detectBulkBackdating(backdateItems);
  const backdatedCount = rows.filter((r) => isBackdated(r.date, r.createdAt)).length;
  const realTimeCount = rows.length - backdatedCount;
  const receiptCount = rows.filter((r) => r.attachment).length;

  // Same tamper-resistant idea as the backdate detection above: a
  // registration change's timestamp is set server-side and can't be
  // edited, so "how recently did this change, relative to right now" is
  // a meaningful, unfakeable fact to hand a buyer.
  const registrationChanges = bike.registrationChanges ?? [];
  const currentRegistration = getCurrentRegistration(bike);
  const mostRecentChange = registrationChanges[registrationChanges.length - 1];
  const daysSinceLastChange = mostRecentChange
    ? Math.round((Date.now() - new Date(mostRecentChange.changedAt).getTime()) / 86400000)
    : null;

  // Verdict metrics - every number here is computed by the same
  // deterministic checks already used elsewhere in the app (the
  // mileage audit, the backdate detector, the reminder-status logic),
  // never a fresh judgement invented for this page. Fuel logs are
  // fetched only for their mileage points, not shown as spend rows -
  // that existing decision (see the caveat text below) is unchanged.
  const entriesInBulkClusters = clusters.reduce((sum, c) => sum + c.count, 0);
  const largestClusterSpanDays = clusters.reduce((max, c) => Math.max(max, c.spanDays), 0);

  const mileagePoints = [
    ...records.map((r) => ({ id: r.id, date: r.date, mileage: r.mileage, mileageConfidence: r.mileageConfidence })),
    ...fuelLogs.map((f) => ({ id: f.id, date: f.date, mileage: f.mileage, mileageConfidence: f.mileageConfidence })),
    ...mods.map((m) => ({ id: m.id, date: m.date, mileage: m.mileage, mileageConfidence: m.mileageConfidence })),
  ];
  const mileageViolationCount = findMileageMonotonicityViolations(mileagePoints).length;

  const sortedRowDates = rows.map((r) => new Date(r.date).getTime()).sort((a, b) => a - b);
  let longestGapDays = 0;
  for (let i = 1; i < sortedRowDates.length; i++) {
    longestGapDays = Math.max(longestGapDays, Math.round((sortedRowDates[i] - sortedRowDates[i - 1]) / 86400000));
  }
  const spanYears = sortedRowDates.length >= 2 ? (sortedRowDates[sortedRowDates.length - 1] - sortedRowDates[0]) / (86400000 * 365) : 0;

  const overdueReminderCount = reminders.filter((r) => computeReminderStatus(r, bike.currentMileage) === "overdue").length;

  // #1 - upcoming costs. Same reminder data already shown elsewhere in
  // the app, just surfaced here for a buyer's benefit: not just what's
  // overdue, but what's coming, so this reads as a budgeting aid rather
  // than only a history document.
  const upcomingReminders = reminders
    .map((r) => ({ reminder: r, status: computeReminderStatus(r, bike.currentMileage) }))
    .filter(({ status }) => status === "due-soon" || status === "overdue")
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "overdue" ? -1 : 1));

  // #4 - consumables likely due soon, inferred directly from service
  // history rather than the reminder system - catches items that would
  // otherwise be missed if a reminder was never created (common for
  // old, backfilled history) or was deleted since. Skips anything
  // already covered by an active reminder above, so nothing shows twice.
  const activeReminderJobTypes = new Set(
    reminders.map((r) => r.sourceKey).filter((k): k is string => Boolean(k?.startsWith("service:"))).map((k) => k.slice("service:".length))
  );
  const consumablesDueSoon = findConsumablesDueSoon(
    records.map((r) => ({ jobType: r.jobType, mileage: r.mileage, date: r.date })),
    bike.currentMileage,
    activeReminderJobTypes
  );

  const verdictMetrics: SellerVerdictMetrics = {
    totalEntries: rows.length,
    receiptCount,
    entriesInBulkClusters,
    largestClusterSpanDays,
    mileageViolationCount,
    longestGapDays,
    spanYears,
    overdueReminderCount,
    totalReminderCount: reminders.length,
    recentRegistrationChangeDays: daysSinceLastChange,
  };
  const verdict = computeSellerVerdict(verdictMetrics);
  // #3 - same metrics, turned into specific questions instead of prose.
  const buyerQuestions = generateBuyerQuestions(verdictMetrics);

  const verdictBadgeClass =
    verdict.tier === "well-documented" ? styles.verdictGood : verdict.tier === "partially-documented" ? styles.verdictMid : styles.verdictPoor;

  // #2 - DVSA link. Deliberately the safe, definitely-correct starting
  // point rather than a guessed pre-fill parameter - the service itself
  // blocks automated verification of its form, so I'm not shipping an
  // unconfirmed query parameter on something this public-facing. Still
  // removes almost all the friction: the buyer has the plate right here
  // and one click away from the government's own record.
  const motCheckUrl = "https://www.check-mot.service.gov.uk/";

  // #5 - anti-tamper QR code. Generated server-side as a data URL, no
  // client JS needed - points at this exact report's own live URL, so a
  // printed copy handed over at an in-person viewing can be scanned to
  // confirm it matches what's actually hosted, not something edited
  // after printing.
  const canonicalReportUrl = `${process.env.APP_URL ?? "https://roadverdict.co.uk"}/report/${params.token}`;
  const qrDataUrl = await QRCode.toDataURL(canonicalReportUrl, { margin: 1, width: 160 });

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

      <div className={styles.registrationBlock}>
        {currentRegistration ? (
          <>
            <p>
              {registrationChanges.length === 0 ? (
                <>Registered as <strong>{currentRegistration}</strong> since being added to RoadVerdict on {fmtDate(bike.dateAdded)}.</>
              ) : (
                <>
                  Originally registered as <strong>{bike.originalRegistration}</strong> (added to RoadVerdict {fmtDate(bike.dateAdded)}),
                  currently <strong>{currentRegistration}</strong> (since {fmtDate(mostRecentChange!.changedAt)}).
                </>
              )}
            </p>
            {registrationChanges.length >= 2 && (
              <p className={styles.registrationNote}>
                This bike&apos;s registration has been changed {registrationChanges.length} times since being added to RoadVerdict.
              </p>
            )}
            {daysSinceLastChange !== null && daysSinceLastChange <= 30 && (
              <p className={styles.registrationWarning}>
                ⚠️ Registration changed to {currentRegistration} on {fmtDate(mostRecentChange!.changedAt)} - just {daysSinceLastChange}{" "}
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

      {rows.length === 0 ? (
        <p>No service, modification, or bill history has been logged for this bike yet.</p>
      ) : (
        <>
          {(backdatedCount > 0 || receiptCount > 0) && (
            <p className={styles.backdateSummary}>
              {realTimeCount} of {rows.length} entries were logged close to when the work was done
              {backdatedCount > 0 && <> - {backdatedCount} {backdatedCount === 1 ? "was" : "were"} added later, see the notes below</>}.{" "}
              {receiptCount} of {rows.length} {receiptCount === 1 ? "has" : "have"} a receipt or invoice attached.
            </p>
          )}
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Cost</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const backdated = isBackdated(r.date, r.createdAt);
                const notice = backdated ? backdateNotice(r.date, r.createdAt) : "";
                const isPrePurchase = r.category === "Modification" && isBeforeProduction(r.date, bike);
                const isImage = r.attachment?.fileType === "image/jpeg" || r.attachment?.fileType === "image/png";
                const attachmentUrl = r.attachment ? `/api/tracker/report-attachment/${params.token}/${encodeURIComponent(r.attachment.blobName)}` : null;
                return (
                  <tr key={r.id}>
                    <td>
                      {fmtDate(r.date)}
                      {isPrePurchase && (
                        <div className={styles.backdateNoteSoft}>Pre-purchase expense (bought before {bike.year})</div>
                      )}
                      {backdated && (
                        <div className={r.attachment ? styles.backdateNoteSoft : styles.backdateNote}>
                          {notice}
                          {r.attachment && " (receipt attached)"}
                        </div>
                      )}
                    </td>
                    <td>{r.category}</td>
                    <td>{r.description}</td>
                    <td>{fmtMoney(r.cost)}</td>
                    <td>
                      {attachmentUrl ? (
                        <a href={attachmentUrl} target="_blank" rel="noopener" className={styles.receiptLink} title={r.attachment?.fileName}>
                          {isImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={attachmentUrl} alt="" className={styles.receiptThumb} />
                          ) : (
                            <span className={styles.receiptThumbPdf}>PDF</span>
                          )}
                          <span className={styles.receiptLabel}>View</span>
                        </a>
                      ) : (
                        <span className={styles.noReceipt}>— none provided</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Total logged spend</td>
                <td>{fmtMoney(total)}</td>
              </tr>
            </tfoot>
          </table>
        </>
      )}

      <p className={styles.caveat}>
        The badge above reflects how completely this bike&apos;s history has been documented on RoadVerdict - it is
        not a judgement of the owner. This history is self-reported by the bike&apos;s owner and has not been
        independently verified against DVSA MOT records. &quot;Logged after the claimed date&quot; notes reflect
        when an entry was actually added to RoadVerdict, compared with the date the owner said the work
        was done - a gap here isn&apos;t necessarily dishonest (people digitise old paper receipts all
        the time), but it&apos;s a fact worth knowing before you rely on this history. Fuel spend is not
        included, since it isn&apos;t relevant to a buyer. Generated {fmtDate(new Date().toISOString())}.
      </p>
    </div>
  );
}
