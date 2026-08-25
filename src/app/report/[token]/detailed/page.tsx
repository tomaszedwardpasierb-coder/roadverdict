// Place at: src/app/report/[token]/detailed/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveShareToken } from "@/lib/tracker/shareLink";
import { getSellerReportData } from "@/lib/tracker/sellerReportData";
import { hasReportAccess } from "@/lib/tracker/reportAccess";
import { PlateGate } from "../PlateGate";
import { describeJobTypeGroup } from "@/lib/tracker/reportNarrative";
import { ReportHistoryTable } from "../ReportHistoryTable";
import QRCode from "qrcode";
import { fetchMotHistoryFromVdg } from "@/lib/tracker/motHistoryFetch";
import { updateBikeBuyerOpinionCache } from "@/lib/tracker/bike";
import { generateBuyerOpinion, type BuyerOpinionInput } from "@/lib/tracker/buyerOpinionProse";
import { buildKnownFacts } from "@/lib/tracker/knownFacts";
import { buildWalkAwayIssues, INSPECTION_REQUIRED_RISKS } from "@/lib/tracker/walkAwayRisks";
import { buildBuyerActionPlan } from "@/lib/tracker/buyerActionPlan";
import { MECHANICAL_CONFIDENCE_STATEMENT } from "@/lib/tracker/confidenceLimits";
import { buildNegotiationSummary } from "@/lib/tracker/negotiationSummary";
import { getSession } from "@/lib/auth/session";
import { RequestHistoryCta } from "../RequestHistoryCta";
import styles from "../report.module.css";
import { PrintButton } from "../PrintButton";

export const dynamic = "force-dynamic";

// Same weekly cap and same reasoning as Story So Far's COOLDOWN_MS -
// see buyerOpinionCache on BikeDoc for why this page specifically
// needs one even though it isn't triggered by an explicit button click.
const OPINION_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function DetailedReportPage({ params }: { params: { token: string } }) {
  const resolved = await resolveShareToken(params.token);
  if (!resolved) notFound();

  const verified = await hasReportAccess(params.token);
  if (!verified) return <PlateGate token={params.token} />;

  // Never used to gate viewing the report itself - only to decide
  // whether the request-history CTA makes sense to show at all (never
  // to the bike's own current owner) and which state it should render.
  let viewerSession: Awaited<ReturnType<typeof getSession>> = null;
  try {
    viewerSession = await getSession();
  } catch (err) {
    console.error("Detailed report page: getSession() failed, continuing as signed out:", err);
  }
  const showRequestHistoryCta = viewerSession?.email !== resolved.email;

  const data = await getSellerReportData(params.token);
  const {
    bike, rows, total, backdatedCount, realTimeCount, receiptCount,
    currentRegistration, registrationChangesCount, upcomingReminders, consumablesDueSoon, upcomingCostItems,
    evidenceQuality, motCheckUrl, mileageCheck, storyParagraphs, jobTypeGroups, supportedFindings,
    unconfirmedFindings, detailedQuestions, verdict, askingPrice,
  } = data;

  const canonicalReportUrl = `${process.env.APP_URL ?? "https://roadverdict.co.uk"}/report/${params.token}/detailed`;
  const qrDataUrl = await QRCode.toDataURL(canonicalReportUrl, { margin: 1, width: 150 });

  // Best-effort, non-blocking - a failed lookup or a bike with no MOT
  // history yet (under 3 years old, MOT-exempt) just means this section
  // doesn't render. Never lets a lookup problem break the report itself.
  const motHistory = currentRegistration ? await fetchMotHistoryFromVdg(currentRegistration) : null;

  const knownFacts = buildKnownFacts(bike, currentRegistration, registrationChangesCount, rows.length, receiptCount, motHistory);
  const walkAwayIssues = buildWalkAwayIssues(bike, mileageCheck, evidenceQuality);
  const buyerActionPlan = buildBuyerActionPlan(detailedQuestions.length, walkAwayIssues.length);
  const negotiationSummary =
    askingPrice != null
      ? buildNegotiationSummary(askingPrice, upcomingCostItems, walkAwayIssues, unconfirmedFindings, evidenceQuality)
      : null;

  // Same warranty-still-covered logic as the inline JSX block further
  // down (kept as a separate, small duplication rather than reaching
  // into that block's own IIFE from out here - that block works and is
  // already tested, not worth disturbing just to share one value).
  let warrantyStatus: BuyerOpinionInput["warrantyStatus"] = null;
  if (bike.dvlaData && (bike.dvlaData.warrantyMonths || bike.dvlaData.warrantyMiles) && bike.dvlaData.dateFirstRegistered) {
    const regDate = new Date(bike.dvlaData.dateFirstRegistered);
    const monthsOld = (Date.now() - regDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    const timeCovered = bike.dvlaData.warrantyMonths != null ? monthsOld < bike.dvlaData.warrantyMonths : null;
    const mileageCovered = bike.dvlaData.warrantyMiles != null ? bike.currentMileage < bike.dvlaData.warrantyMiles : null;
    const checks = [timeCovered, mileageCovered].filter((v) => v !== null);
    const stillCovered = checks.length > 0 && checks.every((v) => v === true);
    warrantyStatus = stillCovered ? "likely still within warranty" : "likely outside warranty";
  }

  // Cached on the bike doc, refreshed weekly - this page has no login
  // and no rate limit of its own, and can be opened by anyone with the
  // link any number of times, so without a cache an AI call would fire
  // on every single view. See buyerOpinionCache on BikeDoc.
  let buyerOpinion = null;
  if (bike.buyerOpinionCache && Date.now() - new Date(bike.buyerOpinionCache.generatedAt).getTime() < OPINION_COOLDOWN_MS) {
    buyerOpinion = bike.buyerOpinionCache.response;
  } else {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      const opinionInput: BuyerOpinionInput = {
        make: bike.make,
        model: bike.model,
        year: bike.year,
        isCustomBuild: !!bike.isCustomBuild,
        engineCC: bike.engineCC,
        currentMileage: bike.currentMileage,
        verdictLabel: verdict.label,
        verdictReasons: verdict.reasons,
        totalSpend: total,
        totalEntries: rows.length,
        receiptCount,
        backdatedCount,
        realTimeCount,
        dvlaScrapped: !!bike.dvlaData?.isScrapped,
        dvlaExported: !!bike.dvlaData?.isExported,
        dvlaUnscrapped: !!bike.dvlaData?.isUnscrapped,
        warrantyStatus,
        motTestCount: motHistory?.tests.length ?? 0,
        motFailCount: motHistory?.tests.filter((t) => !t.passed).length ?? 0,
        motDueDate: motHistory?.motDueDate ?? null,
        keeperChangeCount: bike.dvlaData?.keeperChangeList.length ?? 0,
        upcomingOverdueCount: upcomingReminders.filter((r) => r.status === "overdue").length + consumablesDueSoon.filter((c) => c.status === "overdue").length,
        upcomingDueSoonCount: upcomingReminders.filter((r) => r.status === "due-soon").length + consumablesDueSoon.filter((c) => c.status !== "overdue").length,
      };
      buyerOpinion = await generateBuyerOpinion(opinionInput, apiKey);
      if (buyerOpinion) {
        // Awaited rather than fire-and-forget, same reasoning as
        // Story So Far's cache save - if this fails, the visitor still
        // gets their opinion this once, they just won't get the free
        // cached re-read for the next visitor within the week.
        await updateBikeBuyerOpinionCache(bike.pk, bike.id, { generatedAt: new Date().toISOString(), response: buyerOpinion });
      }
    }
  }

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

        {buyerOpinion && (
          <>
            <h2 className={styles.docHeading}>The honest read</h2>
            <p className={styles.docParagraph}>{buyerOpinion.honestRead}</p>
            {(buyerOpinion.strengths.length > 0 || buyerOpinion.concerns.length > 0) && (
              <div className={styles.twoColumn}>
                {buyerOpinion.strengths.length > 0 && (
                  <div>
                    <h2 className={styles.docHeading}>Strengths</h2>
                    <ul className={styles.findingsList}>
                      {buyerOpinion.strengths.map((s, i) => <li key={i} className={styles.findingGood}>{s}</li>)}
                    </ul>
                  </div>
                )}
                {buyerOpinion.concerns.length > 0 && (
                  <div>
                    <h2 className={styles.docHeading}>Worth asking about</h2>
                    <ul className={styles.findingsList}>
                      {buyerOpinion.concerns.map((c, i) => <li key={i} className={styles.findingGap}>{c}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <p className={styles.docParagraph} style={{ fontStyle: "italic", color: "var(--ink-soft)" }}>
              An informed read on the record above, the way a dealer reads a service history before a bike arrives
              on the forecourt - not a hands-on inspection, and not a substitute for viewing the bike yourself.
            </p>
          </>
        )}

        <h2 className={styles.docHeading}>Known facts</h2>
        <dl className={styles.itemByItemList}>
          {knownFacts.map((fact, i) => (
            <div key={i} className={styles.itemByItemRow}>
              <dt>{fact.label}</dt>
              <dd>
                {fact.value} <span className={styles.subtext}>({fact.source})</span>
              </dd>
            </div>
          ))}
        </dl>

        <h2 className={styles.docHeading}>Evidence quality</h2>
        {evidenceQuality.totalRecords > 0 ? (
          <>
            <dl className={styles.itemByItemList}>
              <div className={styles.itemByItemRow}>
                <dt>Records logged</dt>
                <dd>{evidenceQuality.totalRecords}</dd>
              </div>
              <div className={styles.itemByItemRow}>
                <dt>Receipt coverage</dt>
                <dd>{evidenceQuality.receiptCount} of {evidenceQuality.totalRecords} ({evidenceQuality.receiptCoveragePct}%)</dd>
              </div>
              <div className={styles.itemByItemRow}>
                <dt>Entered in real time</dt>
                <dd>{evidenceQuality.realTimeCount} of {evidenceQuality.totalRecords} ({evidenceQuality.realTimePct}%)</dd>
              </div>
              {evidenceQuality.longestGapDays > 0 && (
                <div className={styles.itemByItemRow}>
                  <dt>Longest gap between entries</dt>
                  <dd>{evidenceQuality.longestGapDays} days</dd>
                </div>
              )}
              <div className={styles.itemByItemRow}>
                <dt>Mileage internally consistent</dt>
                <dd>
                  {evidenceQuality.mileageInternallyConsistent
                    ? "Yes - no entry shows a lower mileage than one logged before it"
                    : "No - at least one logged entry shows a lower mileage than an earlier one, worth asking about"}
                </dd>
              </div>
            </dl>
            <p className={styles.subtext}>
              This is a self-reported record - everything above marked RoadVerdict was entered by the bike&apos;s
              owner, not independently verified.
            </p>
          </>
        ) : (
          <p className={styles.subtext}>Nothing logged yet for this bike.</p>
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

        <h2 className={styles.docHeading}>Walk-away risks</h2>
        {walkAwayIssues.length > 0 && (
          <>
            <p className={styles.docParagraph} style={{ fontWeight: 600 }}>Potential walk-away issues</p>
            <ul className={styles.findingsList}>
              {walkAwayIssues.map((issue, i) => (
                <li key={i} className={styles.findingGap}>
                  <strong>{issue.label}:</strong> {issue.detail}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className={styles.docParagraph} style={{ fontWeight: 600, marginTop: walkAwayIssues.length > 0 ? "1rem" : 0 }}>
          Inspection-required risks
        </p>
        <p className={styles.docParagraph}>
          Nothing in this report, however clean, can tell you about a bike&apos;s mechanical condition - that
          needs a physical inspection, not a records check. In particular, this data cannot detect:
        </p>
        <ul className={styles.findingsList}>
          {INSPECTION_REQUIRED_RISKS.map((risk, i) => <li key={i}>{risk}</li>)}
        </ul>
        <p className={styles.docParagraph} style={{ fontStyle: "italic", color: "var(--ink-soft)" }}>
          A clean, well-documented digital record is not the same thing as a mechanically sound bike - it&apos;s
          evidence about paperwork and spend, not a substitute for seeing and riding the bike yourself.
        </p>

        <h2 className={styles.docHeading}>Questions worth asking the seller</h2>
        <ol className={styles.questionsList}>
          {detailedQuestions.map((q, i) => <li key={i}>{q}</li>)}
        </ol>

        <h2 className={styles.docHeading}>Buyer action plan</h2>
        <ol className={styles.questionsList}>
          {buyerActionPlan.map((step, i) => (
            <li key={i}>
              <strong>{step.stage}:</strong> {step.detail}
            </li>
          ))}
        </ol>

        <h2 className={styles.docHeading}>Confidence and limitations</h2>
        <dl className={styles.itemByItemList}>
          <div className={styles.itemByItemRow}>
            <dt>Record confidence</dt>
            <dd>
              {verdict.label}
              {verdict.reasons.length > 0 && (
                <ul className={styles.findingsList} style={{ marginTop: "0.4rem" }}>
                  {verdict.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
            </dd>
          </div>
          <div className={styles.itemByItemRow}>
            <dt>Mechanical confidence</dt>
            <dd>{MECHANICAL_CONFIDENCE_STATEMENT}</dd>
          </div>
        </dl>
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

      {upcomingCostItems.length > 0 && (
        <div className={styles.upcomingBlock}>
          <p className={styles.upcomingTitle}>What&apos;s coming up</p>
          <ul className={styles.upcomingList}>
            {upcomingCostItems.map((item) => (
              <li key={item.jobType} className={item.timing === "overdue" ? styles.upcomingOverdue : styles.upcomingSoon}>
                <strong>{item.label}</strong> - {item.timingDetail}
                {item.timing === "overdue" ? " (overdue)" : " (due soon)"}
                <br />
                {item.pricing.status === "priced" ? (
                  <span className={styles.subtext}>
                    Indicative cost if arranged now: £{item.pricing.low}-£{item.pricing.high} ({item.pricing.confidence}{" "}
                    confidence - {item.pricing.sourceName}, last reviewed {item.pricing.lastReviewed})
                  </span>
                ) : (
                  <span className={styles.subtext}>Not currently priced by RoadVerdict</span>
                )}
              </li>
            ))}
          </ul>
          <p className={styles.upcomingNote}>
            Timing is based on this bike&apos;s own logged intervals, not a generic assumption. Where a cost is
            shown, it&apos;s an indicative benchmark against typical UK prices for this size of bike, not a quote
            for this specific bike or garage - treat both as helpful estimates, not guarantees.
          </p>
        </div>
      )}

      {negotiationSummary && (
        <>
          <h2 className={styles.docHeading}>Negotiation points</h2>
          <dl className={styles.itemByItemList}>
            <div className={styles.itemByItemRow}>
              <dt>Asking price</dt>
              <dd>£{negotiationSummary.askingPrice.toLocaleString()}</dd>
            </div>
            {negotiationSummary.upcomingCostsTotal && (
              <div className={styles.itemByItemRow}>
                <dt>Estimated upcoming costs</dt>
                <dd>
                  £{negotiationSummary.upcomingCostsTotal.low.toLocaleString()}-£
                  {negotiationSummary.upcomingCostsTotal.high.toLocaleString()}
                </dd>
              </div>
            )}
          </dl>
          {negotiationSummary.discussionPoints.length > 0 && (
            <>
              <p className={styles.docParagraph} style={{ fontWeight: 600, marginTop: "0.8rem" }}>
                Points worth discussing
              </p>
              <ul className={styles.findingsList}>
                {negotiationSummary.discussionPoints.map((point, i) => <li key={i}>{point}</li>)}
              </ul>
            </>
          )}
          <p className={styles.docParagraph} style={{ fontStyle: "italic", color: "var(--ink-soft)" }}>
            This isn&apos;t a suggested offer or a valuation - RoadVerdict doesn&apos;t estimate what this bike is
            worth, just factual points from this record worth raising before agreeing a price.
          </p>
        </>
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

      {showRequestHistoryCta && currentRegistration && (
        <RequestHistoryCta
          registration={currentRegistration}
          signedInEmail={viewerSession?.email ?? null}
          currentPath={`/report/${params.token}/detailed`}
        />
      )}

      <p className={styles.caveat}>
        This report describes patterns in the logged record - what was entered, when, and how completely - not a
        judgement of the owner or an inspection of the bike itself. This history is self-reported and has not been
        independently verified against DVSA MOT records. Fuel spend is not included, since it isn&apos;t relevant to
        a buyer. Generated {fmtDate(new Date().toISOString())}.
      </p>
    </div>
  );
}
