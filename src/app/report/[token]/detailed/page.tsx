// Place at: src/app/report/[token]/detailed/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveShareToken } from "@/lib/tracker/shareLink";
import { getSellerReportData } from "@/lib/tracker/sellerReportData";
import { hasReportAccess } from "@/lib/tracker/reportAccess";
import { PlateGate } from "../PlateGate";
import { reminderDetailLabel } from "@/lib/tracker/reminderStatus";
import { describeJobTypeGroup } from "@/lib/tracker/reportNarrative";
import { ReportHistoryTable } from "../ReportHistoryTable";
import QRCode from "qrcode";
import { fetchMotHistoryFromVdg } from "@/lib/tracker/motHistoryFetch";
import { fetchValuationFromVdg } from "@/lib/tracker/valuationFetch";
import styles from "../report.module.css";
import { PrintButton } from "../PrintButton";

export const dynamic = "force-dynamic";

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function DetailedReportPage({ params }: { params: { token: string } }) {
  if (!(await resolveShareToken(params.token))) notFound();

  const verified = await hasReportAccess(params.token);
  if (!verified) return <PlateGate token={params.token} />;

  const data = await getSellerReportData(params.token);
  const {
    bike, rows, total, backdatedCount, realTimeCount, receiptCount,
    currentRegistration, upcomingReminders, consumablesDueSoon, motCheckUrl,
    mileageCheck, storyParagraphs, jobTypeGroups, supportedFindings,
    unconfirmedFindings, detailedQuestions,
  } = data;

  const canonicalReportUrl = `${process.env.APP_URL ?? "https://roadverdict.co.uk"}/report/${params.token}/detailed`;
  const qrDataUrl = await QRCode.toDataURL(canonicalReportUrl, { margin: 1, width: 150 });

  // Best-effort, non-blocking - a failed lookup or a bike with no MOT
  // history yet (under 3 years old, MOT-exempt) just means this section
  // doesn't render. Never lets a lookup problem break the report itself.
  const motHistory = currentRegistration ? await fetchMotHistoryFromVdg(currentRegistration) : null;

  // Live, not a stored snapshot - see valuationFetch.ts for why. Uses
  // this bike's real current mileage, not whatever it was when added.
  const valuation = currentRegistration ? await fetchValuationFromVdg(currentRegistration, bike.currentMileage) : null;
  const valuationAttempted = currentRegistration != null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.noPrint} style={{ marginBottom: "1.2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link href={`/report/${params.token}`} className={styles.backLink}>← Back to summary</Link>
        <PrintButton />
      </div>

      <div className={styles.docPage}>
        <p className={styles.upsellFlag}>Buyer Verdict Report</p>
        <h1 className={styles.title}>What this data says about {bike.nickname ? bike.nickname : `this ${bike.make} ${bike.model}`}</h1>
        <p className={styles.subtext}>
          {bike.make} {bike.model} · {bike.isCustomBuild ? "Custom build" : bike.year} · {bike.engineCC}cc ·{" "}
          {bike.currentMileage.toLocaleString()} miles
          {bike.dvlaData?.powerBhp && ` · ${bike.dvlaData.powerBhp}bhp`}
        </p>

        {bike.dvlaData && (bike.dvlaData.warrantyMonths || bike.dvlaData.warrantyMiles) && bike.dvlaData.dateFirstRegistered && (() => {
          const regDate = new Date(bike.dvlaData.dateFirstRegistered!);
          const monthsOld = (Date.now() - regDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
          const timeCovered = bike.dvlaData!.warrantyMonths != null ? monthsOld < bike.dvlaData!.warrantyMonths : null;
          const mileageCovered = bike.dvlaData!.warrantyMiles != null ? bike.currentMileage < bike.dvlaData!.warrantyMiles : null;
          // Standard "whichever comes first" - only counted as still
          // covered if every applicable condition (time, mileage, or
          // both) still holds.
          const checks = [timeCovered, mileageCovered].filter((v) => v !== null);
          const stillCovered = checks.length > 0 && checks.every((v) => v === true);
          const terms = [
            bike.dvlaData!.warrantyMonths ? `${bike.dvlaData!.warrantyMonths} months` : null,
            bike.dvlaData!.warrantyMiles ? `${bike.dvlaData!.warrantyMiles.toLocaleString()} miles` : null,
          ].filter(Boolean).join(' / ');
          return (
            <p className={styles.docParagraph}>
              Manufacturer warranty: {terms} from new, whichever comes first - based on this bike&apos;s
              registration date and current mileage, it&apos;s {stillCovered ? 'likely still within warranty' : 'likely outside the manufacturer warranty period'}.
            </p>
          );
        })()}

        {mileageCheck.implausible && (
          <div className={styles.warnBlock}>
            <p className={styles.warnTitle}>Before anything else</p>
            <p style={{ margin: 0 }}>{mileageCheck.reason}</p>
          </div>
        )}

        {bike.dvlaData && (
          bike.dvlaData.isScrapped || bike.dvlaData.isExported || bike.dvlaData.isUnscrapped ? (
            <div className={styles.warnBlock}>
              <p className={styles.warnTitle}>DVLA status - worth knowing before anything else</p>
              {bike.dvlaData.isScrapped && <p style={{ margin: 0 }}>DVLA has this vehicle recorded as scrapped.</p>}
              {bike.dvlaData.isUnscrapped && (
                <p style={{ margin: 0 }}>This vehicle was previously recorded as scrapped, then later un-scrapped.</p>
              )}
              {bike.dvlaData.isExported && <p style={{ margin: 0 }}>DVLA has this vehicle recorded as exported.</p>}
            </div>
          ) : (
            // Explicit confirmation, not silence - a clean check is a real
            // trust signal for a buyer, and silence here is indistinguishable
            // from "this check never ran" rather than "it ran and found nothing."
            <p className={styles.docParagraph} style={{ color: "var(--ink-soft)" }}>
              DVLA has no scrapped, exported, or unscrapped-status flags on record for this vehicle.
            </p>
          )
        )}

        <h2 className={styles.docHeading}>The story this data tells</h2>
        {storyParagraphs.map((p, i) => <p key={i} className={styles.docParagraph}>{p}</p>)}
        <p className={styles.docParagraph} style={{ fontStyle: "italic", color: "var(--ink-soft)" }}>
          None of this says what actually happened with this bike - it says what the record looks like. What it means is worth asking the seller directly.
        </p>

        {jobTypeGroups.length > 0 && (
          <>
            <h2 className={styles.docHeading}>Item by item</h2>
            <dl className={styles.itemByItemList}>
              {jobTypeGroups.map((g) => (
                <div key={g.jobType} className={styles.itemByItemRow}>
                  <dt>{g.label}</dt>
                  <dd>{describeJobTypeGroup(g)}</dd>
                </div>
              ))}
            </dl>
          </>
        )}

        <div className={styles.twoColumn}>
          <div>
            <h2 className={styles.docHeading}>What the record supports well</h2>
            {supportedFindings.length > 0 ? (
              <ul className={styles.findingsList}>
                {supportedFindings.map((f, i) => <li key={i} className={styles.findingGood}>{f}</li>)}
              </ul>
            ) : (
              <p className={styles.subtext}>No category currently has a complete receipt trail.</p>
            )}
          </div>
          <div>
            <h2 className={styles.docHeading}>What the record can&apos;t yet confirm</h2>
            <ul className={styles.findingsList}>
              {unconfirmedFindings.map((f, i) => <li key={i} className={styles.findingGap}>{f}</li>)}
            </ul>
          </div>
        </div>

        <h2 className={styles.docHeading}>Questions worth asking the seller</h2>
        <ol className={styles.questionsList}>
          {detailedQuestions.map((q, i) => <li key={i}>{q}</li>)}
        </ol>
      </div>

      {motHistory && motHistory.tests.length > 0 && (
        <>
          <h2 className={styles.docHeading}>MOT history (DVSA-verified)</h2>
          <p className={styles.docParagraph}>
            Pulled directly from DVSA&apos;s own records - independent of anything the owner has entered into
            RoadVerdict.{motHistory.motDueDate && ` Next MOT due ${fmtDate(motHistory.motDueDate)}.`}
          </p>
          <dl className={styles.itemByItemList}>
            {motHistory.tests.slice().reverse().map((t, i) => (
              <div key={i} className={styles.itemByItemRow}>
                <dt>{fmtDate(t.testDate)}</dt>
                <dd>{t.notes}{t.mileage != null ? ` (${t.mileage.toLocaleString()} mi)` : ''}</dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {bike.dvlaData && (bike.dvlaData.keeperChangeList.length > 0 || bike.dvlaData.v5cIssueDates.length > 0) && (
        <>
          <h2 className={styles.docHeading}>Ownership history (DVLA-verified)</h2>
          <p className={styles.docParagraph}>
            Recorded directly with DVLA, independent of anything logged in RoadVerdict.
          </p>
          {bike.dvlaData.keeperChangeList.length > 0 && (
            <dl className={styles.itemByItemList}>
              {bike.dvlaData.keeperChangeList.slice().reverse().map((k, i) => (
                <div key={`keeper-${i}`} className={styles.itemByItemRow}>
                  <dt>{fmtDate(k.keeperStartDate)}</dt>
                  <dd>
                    New keeper registered
                    {k.previousKeeperDisposalDate ? ` (previous keeper disposed ${fmtDate(k.previousKeeperDisposalDate)})` : ''}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {bike.dvlaData.v5cIssueDates.length > 0 && (
            <dl className={styles.itemByItemList}>
              {bike.dvlaData.v5cIssueDates.slice().reverse().map((d, i) => (
                <div key={`v5c-${i}`} className={styles.itemByItemRow}>
                  <dt>{fmtDate(d)}</dt>
                  <dd>V5C logbook issued{i === 0 && bike.dvlaData!.v5cIssueDates.length > 1 ? ' (most recent)' : ''}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}

      {valuationAttempted && (
        <>
          <h2 className={styles.docHeading}>Estimated value</h2>
          {valuation ? (
            <>
              <p className={styles.docParagraph}>
                Based on this bike&apos;s actual current mileage ({bike.currentMileage.toLocaleString()} miles) -
                a rough guide, not a guarantee, and only as good as the market data behind it.
              </p>
              <dl className={styles.itemByItemList}>
                {valuation.figures.privateClean != null && (
                  <div className={styles.itemByItemRow}>
                    <dt>Private sale (clean/excellent)</dt>
                    <dd>£{valuation.figures.privateClean.toLocaleString()}</dd>
                  </div>
                )}
                {valuation.figures.privateAverage != null && (
                  <div className={styles.itemByItemRow}>
                    <dt>Private sale (average condition)</dt>
                    <dd>£{valuation.figures.privateAverage.toLocaleString()}</dd>
                  </div>
                )}
                {valuation.figures.dealerForecourt != null && (
                  <div className={styles.itemByItemRow}>
                    <dt>Dealer forecourt</dt>
                    <dd>£{valuation.figures.dealerForecourt.toLocaleString()}</dd>
                  </div>
                )}
                {valuation.figures.partExchange != null && (
                  <div className={styles.itemByItemRow}>
                    <dt>Part exchange</dt>
                    <dd>£{valuation.figures.partExchange.toLocaleString()}</dd>
                  </div>
                )}
              </dl>
            </>
          ) : (
            <p className={styles.docParagraph} style={{ color: "var(--ink-soft)" }}>
              Valuation data isn&apos;t available for this specific model.
            </p>
          )}
        </>
      )}

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

      <h2 className={styles.docHeading}>Full logged history</h2>
      <ReportHistoryTable
        rows={rows}
        total={total}
        bike={bike}
        token={params.token}
        backdatedCount={backdatedCount}
        realTimeCount={realTimeCount}
        receiptCount={receiptCount}
        entryRequestStatus={data.entryRequestStatus}
      />

      <p className={styles.caveat}>
        This report describes patterns in the logged record - what was entered, when, and how completely - not a
        judgement of the owner or an inspection of the bike itself. This history is self-reported and has not been
        independently verified against DVSA MOT records. Fuel spend is not included, since it isn&apos;t relevant to
        a buyer. Generated {fmtDate(new Date().toISOString())}.
      </p>
    </div>
  );
}
