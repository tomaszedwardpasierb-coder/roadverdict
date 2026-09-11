// Place at: src/app/car-report/[token]/detailed/page.tsx
// Car mirror of report/[token]/detailed/page.tsx.
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveCarShareToken, updateCarShareLinkVdiUnlock } from "@/lib/tracker/carShareLink";
import { selfHealVdiUnlock } from "@/lib/payments/vdiCheckout";
import { fetchVdiCheckFromVdg } from "@/lib/tracker/vdiCheckFetch";
import { fetchValuationFromVdg } from "@/lib/tracker/valuationFetch";
import { generateVdiSummary } from "@/lib/tracker/vdiSummaryProse";
import { VdiCheckSection } from "@/components/VdiCheckSection";
import type { VdiUnlock } from "@/lib/tracker/vdiUnlock";
import { getCarSellerReportData } from "@/lib/tracker/carSellerReportData";
import { hasReportAccess } from "@/lib/tracker/reportAccess";
import { CarPlateGate } from "../CarPlateGate";
import { describeJobTypeGroup } from "@/lib/tracker/reportNarrative";
import { CarReportHistoryTable } from "../CarReportHistoryTable";
import QRCode from "qrcode";
import { fetchMotHistoryFromVdg } from "@/lib/tracker/motHistoryFetch";
import { updateCarBuyerOpinionCache, type CarDoc } from "@/lib/tracker/car";
import { generateCarBuyerOpinion, type CarBuyerOpinionInput } from "@/lib/tracker/carBuyerOpinionProse";
import { buildCarKnownFacts } from "@/lib/tracker/carKnownFacts";
import { buildCarWalkAwayIssues, CAR_INSPECTION_REQUIRED_RISKS } from "@/lib/tracker/carWalkAwayRisks";
import { buildBuyerActionPlan } from "@/lib/tracker/buyerActionPlan";
import { MECHANICAL_CONFIDENCE_STATEMENT } from "@/lib/tracker/confidenceLimits";
import { buildNegotiationSummary } from "@/lib/tracker/negotiationSummary";
import { getSession } from "@/lib/auth/session";
import { CarRequestHistoryCta } from "../CarRequestHistoryCta";
import styles from "../report.module.css";
import { PrintButton } from "@/app/report/[token]/PrintButton";
import { VdiIcon } from "@/components/VdiIcon";
import {
  Search, FileCheck, ShieldCheck, ScrollText, ListChecks, AlertTriangle,
  HelpCircle, ListOrdered, Gauge, ClipboardCheck, Users, Handshake, Table2,
  type LucideIcon,
} from "lucide-react";

export const dynamic = "force-dynamic";

const OPINION_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function SectionHeading({
  icon: IconComp,
  id,
  children,
}: {
  icon: LucideIcon;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <h2 className={styles.docHeading} id={id}>
      <IconComp size={16} aria-hidden className={styles.docHeadingIcon} />
      {children}
    </h2>
  );
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function engineDescription(car: CarDoc): string {
  if (car.fuelType === "electric") {
    return car.batteryKwh ? `Electric, ${car.batteryKwh}kWh battery` : "Electric";
  }
  const litres = car.engineLitres ? `${car.engineLitres}L` : "Unknown size";
  return car.fuelType === "hybrid" || car.fuelType === "phev" ? `${litres} hybrid` : litres;
}

export default async function CarDetailedReportPage(props: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const resolved = await resolveCarShareToken(params.token);
  if (!resolved) notFound();

  // Covers the case where the browser returns from Stripe before the
  // webhook has landed - see selfHealVdiUnlock's own comment. The
  // webhook remains the authoritative path either way.
  let vdiUnlock: VdiUnlock | undefined = resolved.vdiUnlock;
  if (!vdiUnlock && searchParams.session_id) {
    vdiUnlock = (await selfHealVdiUnlock(params.token, "car", searchParams.session_id)) ?? undefined;
  }

  const verified = await hasReportAccess(params.token);
  if (!verified) return <CarPlateGate token={params.token} />;

  // Never used to gate viewing the report itself - only to decide
  // whether the request-history CTA makes sense to show at all (never
  // to the car's own current owner) and which state it should render.
  let viewerSession: Awaited<ReturnType<typeof getSession>> = null;
  try {
    viewerSession = await getSession();
  } catch (err) {
    console.error("Car detailed report page: getSession() failed, continuing as signed out:", err);
  }
  const showRequestHistoryCta = viewerSession?.email !== resolved.email;

  const data = await getCarSellerReportData(params.token);
  const {
    car, rows, total, backdatedCount, realTimeCount, receiptCount,
    currentRegistration, registrationChangesCount, upcomingReminders, consumablesDueSoon, upcomingCostItems,
    evidenceQuality, motCheckUrl, mileageCheck, storyParagraphs, jobTypeGroups, supportedFindings,
    unconfirmedFindings, detailedQuestions, verdict, askingPrice,
  } = data;

  // Lazy-fill, generate-once: unlike buyerOpinionCache's rolling 7-day
  // cooldown, this was paid for once - so VDG/Gemini are only ever
  // spent the first time this section renders after purchase, then
  // cached forever on the share link's own vdiUnlock field.
  if (vdiUnlock && !vdiUnlock.vdiCheck && currentRegistration) {
    const vdgApiKey = process.env.VDG_API_KEY;
    const [vdiCheck, valuation] = vdgApiKey
      ? await Promise.all([fetchVdiCheckFromVdg(currentRegistration, vdgApiKey), fetchValuationFromVdg(currentRegistration, vdgApiKey)])
      : [null, null];
    let aiSummary = null;
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (vdiCheck && geminiApiKey) {
      aiSummary = await generateVdiSummary(
        {
          make: car.make,
          model: car.model,
          year: car.year ?? null,
          vdiCheck,
          valuation: valuation ?? undefined,
          askingPrice: askingPrice ?? undefined,
          verdictLabel: verdict.label,
          loggedKeeperChangeCount: car.dvlaData?.keeperChangeList.length ?? 0,
        },
        geminiApiKey
      );
    }
    if (vdiCheck) {
      const updated = await updateCarShareLinkVdiUnlock(params.token, { vdiCheck, valuation: valuation ?? undefined, aiSummary });
      if (updated?.vdiUnlock) vdiUnlock = updated.vdiUnlock;
    }
  }

  const canonicalReportUrl = `${process.env.APP_URL ?? "https://roadverdict.co.uk"}/car-report/${params.token}/detailed`;
  const qrDataUrl = await QRCode.toDataURL(canonicalReportUrl, { margin: 1, width: 150 });

  const motHistory = currentRegistration ? await fetchMotHistoryFromVdg(currentRegistration) : null;

  const knownFacts = buildCarKnownFacts(car, currentRegistration, registrationChangesCount, rows.length, receiptCount, motHistory);
  const walkAwayIssues = buildCarWalkAwayIssues(car, mileageCheck, evidenceQuality);
  const buyerActionPlan = buildBuyerActionPlan(detailedQuestions.length, walkAwayIssues.length);
  const negotiationSummary =
    askingPrice != null
      ? buildNegotiationSummary(askingPrice, upcomingCostItems, walkAwayIssues, unconfirmedFindings, evidenceQuality)
      : null;

  let warrantyStatus: CarBuyerOpinionInput["warrantyStatus"] = null;
  if (car.dvlaData && (car.dvlaData.warrantyMonths || car.dvlaData.warrantyMiles) && car.dvlaData.dateFirstRegistered) {
    const regDate = new Date(car.dvlaData.dateFirstRegistered);
    const monthsOld = (Date.now() - regDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    const timeCovered = car.dvlaData.warrantyMonths != null ? monthsOld < car.dvlaData.warrantyMonths : null;
    const mileageCovered = car.dvlaData.warrantyMiles != null ? car.currentMileage < car.dvlaData.warrantyMiles : null;
    const checks = [timeCovered, mileageCovered].filter((v) => v !== null);
    const stillCovered = checks.length > 0 && checks.every((v) => v === true);
    warrantyStatus = stillCovered ? "likely still within warranty" : "likely outside warranty";
  }

  // Small, named subset of the VDI check handed to the buyer-opinion
  // generator - see BuyerOpinionInput's own vdiCheck field comment in
  // buyerOpinionProse.ts (identical reasoning here).
  const vdiOpinionFacts = vdiUnlock?.vdiCheck
    ? {
        isStolen: vdiUnlock.vdiCheck.isStolen,
        hasWriteOffRecord: vdiUnlock.vdiCheck.hasWriteOffRecord,
        writeOffRecordCount: vdiUnlock.vdiCheck.writeOffRecordCount,
        hasOutstandingFinance: vdiUnlock.vdiCheck.hasOutstandingFinance,
        mileageAnomaly: !!vdiUnlock.vdiCheck.mileageReadings?.some((r) => !r.inSequence),
        ncapStarRating: vdiUnlock.vdiCheck.ncapStarRating ?? null,
      }
    : undefined;

  let buyerOpinion = null;
  const cacheHasVdiCoverage = !vdiOpinionFacts || !!car.buyerOpinionCache?.hadVdiCheck;
  if (car.buyerOpinionCache && cacheHasVdiCoverage && Date.now() - new Date(car.buyerOpinionCache.generatedAt).getTime() < OPINION_COOLDOWN_MS) {
    buyerOpinion = car.buyerOpinionCache.response;
  } else {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      const opinionInput: CarBuyerOpinionInput = {
        make: car.make,
        model: car.model,
        year: car.year,
        isCustomBuild: !!car.isCustomBuild,
        fuelType: car.fuelType,
        engineLitres: car.engineLitres,
        batteryKwh: car.batteryKwh,
        currentMileage: car.currentMileage,
        verdictLabel: verdict.label,
        verdictReasons: verdict.reasons,
        totalSpend: total,
        totalEntries: rows.length,
        receiptCount,
        backdatedCount,
        realTimeCount,
        dvlaScrapped: !!car.dvlaData?.isScrapped,
        dvlaExported: !!car.dvlaData?.isExported,
        dvlaUnscrapped: !!car.dvlaData?.isUnscrapped,
        warrantyStatus,
        motTestCount: motHistory?.tests.length ?? 0,
        motFailCount: motHistory?.tests.filter((t) => !t.passed).length ?? 0,
        motDueDate: motHistory?.motDueDate ?? null,
        keeperChangeCount: car.dvlaData?.keeperChangeList.length ?? 0,
        upcomingOverdueCount: upcomingReminders.filter((r) => r.status === "overdue").length + consumablesDueSoon.filter((c) => c.status === "overdue").length,
        upcomingDueSoonCount: upcomingReminders.filter((r) => r.status === "due-soon").length + consumablesDueSoon.filter((c) => c.status !== "overdue").length,
        vdiCheck: vdiOpinionFacts,
      };
      buyerOpinion = await generateCarBuyerOpinion(opinionInput, apiKey);
      if (buyerOpinion) {
        await updateCarBuyerOpinionCache(car.pk, car.id, {
          generatedAt: new Date().toISOString(),
          response: buyerOpinion,
          hadVdiCheck: !!vdiOpinionFacts,
        });
      }
    }
  }

  const jumpNavItems: { href: string; label: string }[] = [{ href: "#independent-check", label: "Independent check" }, { href: "#known-facts", label: "Known facts" }];
  if (motHistory && motHistory.tests.length > 0) jumpNavItems.push({ href: "#mot-history", label: "MOT history" });
  if (car.dvlaData && (car.dvlaData.keeperChangeList.length > 0 || car.dvlaData.v5cIssueDates.length > 0)) {
    jumpNavItems.push({ href: "#ownership-history", label: "Ownership" });
  }
  if (upcomingCostItems.length > 0) jumpNavItems.push({ href: "#whats-coming-up", label: "Costs" });
  jumpNavItems.push({ href: "#questions", label: "Questions" });
  jumpNavItems.push({ href: "#full-record", label: "Full record" });

  const overdueCount = upcomingCostItems.filter((i) => i.timing === "overdue").length;
  const verdictTierClass =
    verdict.tier === "well-documented" ? styles.verdictGood : verdict.tier === "partially-documented" ? styles.verdictMid : styles.verdictPoor;

  return (
    <div className={styles.wrapper}>
      <div className={styles.noPrint} style={{ marginBottom: "1.2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link href={`/car-report/${params.token}`} className={styles.backLink}>← Back to summary</Link>
        <PrintButton />
      </div>

      <p className={styles.upsellFlag}>Buyer Verdict Report</p>
      <h1 className={styles.title}>What this data says about {car.nickname ? car.nickname : `this ${car.make} ${car.model}`}</h1>
      <p className={styles.subtext}>
        {car.make} {car.model} · {car.isCustomBuild ? "Custom build" : car.year} · {engineDescription(car)} ·{" "}
        {car.currentMileage.toLocaleString()} miles
        {car.dvlaData?.powerBhp && ` · ${car.dvlaData.powerBhp}bhp`}
      </p>

      <div className={`${styles.verdictBlock} ${verdictTierClass}`}>
        <p className={styles.verdictBadge}>{verdict.label}</p>
        <p className={styles.docParagraph} style={{ margin: 0 }}>
          {buyerOpinion ? buyerOpinion.honestRead : verdict.reasons[0] ?? "See the full record below for what's behind this documentation tier."}
        </p>
        {(overdueCount > 0 || walkAwayIssues.length > 0 || vdiOpinionFacts || (buyerOpinion && (buyerOpinion.strengths.length > 0 || buyerOpinion.concerns.length > 0))) && (
          <div className={styles.verdictChips}>
            {vdiOpinionFacts?.isStolen && (
              <span className={styles.verdictChipWarn}><VdiIcon name="stolen" size={12} />Recorded stolen</span>
            )}
            {vdiOpinionFacts?.hasWriteOffRecord && (
              <span className={styles.verdictChipWarn}><VdiIcon name="writeOff" size={12} />Write-off record</span>
            )}
            {vdiOpinionFacts?.hasOutstandingFinance && (
              <span className={styles.verdictChipWarn}><VdiIcon name="finance" size={12} />Outstanding finance</span>
            )}
            {vdiOpinionFacts?.mileageAnomaly && (
              <span className={styles.verdictChipWarn}><VdiIcon name="mileage" size={12} />VDI mileage anomaly</span>
            )}
            {buyerOpinion && buyerOpinion.strengths.length > 0 && (
              <span className={styles.verdictChipGood}>{buyerOpinion.strengths.length} strength{buyerOpinion.strengths.length === 1 ? "" : "s"}</span>
            )}
            {buyerOpinion && buyerOpinion.concerns.length > 0 && (
              <span className={styles.verdictChipWarn}>{buyerOpinion.concerns.length} worth asking about</span>
            )}
            {walkAwayIssues.length > 0 && (
              <span className={styles.verdictChipWarn}>{walkAwayIssues.length} walk-away flag{walkAwayIssues.length === 1 ? "" : "s"}</span>
            )}
            {overdueCount > 0 && <span className={styles.verdictChipNeutral}>{overdueCount} overdue</span>}
          </div>
        )}
      </div>

      <nav className={styles.jumpNav} aria-label="Jump to a section">
        <div className={styles.jumpNavInner}>
          {jumpNavItems.map((item) => (
            <a key={item.href} href={item.href} className={styles.jumpNavItem}>{item.label}</a>
          ))}
        </div>
      </nav>

      <VdiCheckSection
        vehicleKind="car"
        token={params.token}
        registration={currentRegistration}
        make={car.make}
        model={car.model}
        vdiUnlock={vdiUnlock}
      />

      <div className={styles.docPage}>
        {car.dvlaData && (car.dvlaData.warrantyMonths || car.dvlaData.warrantyMiles) && car.dvlaData.dateFirstRegistered && (() => {
          const regDate = new Date(car.dvlaData.dateFirstRegistered!);
          const monthsOld = (Date.now() - regDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
          const timeCovered = car.dvlaData!.warrantyMonths != null ? monthsOld < car.dvlaData!.warrantyMonths : null;
          const mileageCovered = car.dvlaData!.warrantyMiles != null ? car.currentMileage < car.dvlaData!.warrantyMiles : null;
          const checks = [timeCovered, mileageCovered].filter((v) => v !== null);
          const stillCovered = checks.length > 0 && checks.every((v) => v === true);
          const terms = [
            car.dvlaData!.warrantyMonths ? `${car.dvlaData!.warrantyMonths} months` : null,
            car.dvlaData!.warrantyMiles ? `${car.dvlaData!.warrantyMiles.toLocaleString()} miles` : null,
          ].filter(Boolean).join(' / ');
          return (
            <p className={styles.docParagraph}>
              Manufacturer warranty: {terms} from new, whichever comes first - based on this car&apos;s
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

        {car.dvlaData && (
          car.dvlaData.isScrapped || car.dvlaData.isExported || car.dvlaData.isUnscrapped ? (
            <div className={styles.warnBlock}>
              <p className={styles.warnTitle}>DVLA status - worth knowing before anything else</p>
              {car.dvlaData.isScrapped && <p style={{ margin: 0 }}>DVLA has this vehicle recorded as scrapped.</p>}
              {car.dvlaData.isUnscrapped && (
                <p style={{ margin: 0 }}>This vehicle was previously recorded as scrapped, then later un-scrapped.</p>
              )}
              {car.dvlaData.isExported && <p style={{ margin: 0 }}>DVLA has this vehicle recorded as exported.</p>}
            </div>
          ) : (
            <p className={styles.docParagraph} style={{ color: "var(--ink-soft)" }}>
              DVLA has no scrapped, exported, or unscrapped-status flags on record for this vehicle.
            </p>
          )
        )}

        {buyerOpinion && (
          <>
            <SectionHeading icon={Search}>The honest read</SectionHeading>
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
              An informed read on the record above, the way a dealer reads a service history before a car arrives
              on the forecourt - not a hands-on inspection, and not a substitute for viewing the car yourself.
            </p>
          </>
        )}

        <SectionHeading icon={FileCheck} id="known-facts">Known facts</SectionHeading>
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

        <SectionHeading icon={ShieldCheck}>Evidence quality</SectionHeading>
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
              This is a self-reported record - everything above marked RoadVerdict was entered by the car&apos;s
              owner, not independently verified.
            </p>
          </>
        ) : (
          <p className={styles.subtext}>Nothing logged yet for this car.</p>
        )}

        <SectionHeading icon={ScrollText}>The story this data tells</SectionHeading>
        {storyParagraphs.map((p, i) => <p key={i} className={styles.docParagraph}>{p}</p>)}
        <p className={styles.docParagraph} style={{ fontStyle: "italic", color: "var(--ink-soft)" }}>
          None of this says what actually happened with this car - it says what the record looks like. What it means is worth asking the seller directly.
        </p>

        {jobTypeGroups.length > 0 && (
          <>
            <SectionHeading icon={ListChecks}>Item by item</SectionHeading>
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

        <SectionHeading icon={AlertTriangle}>Walk-away risks</SectionHeading>
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
          Nothing in this report, however clean, can tell you about a car&apos;s mechanical condition - that
          needs a physical inspection, not a records check. In particular, this data cannot detect:
        </p>
        <ul className={styles.findingsList}>
          {CAR_INSPECTION_REQUIRED_RISKS.map((risk, i) => <li key={i}>{risk}</li>)}
        </ul>
        <p className={styles.docParagraph} style={{ fontStyle: "italic", color: "var(--ink-soft)" }}>
          A clean, well-documented digital record is not the same thing as a mechanically sound car - it&apos;s
          evidence about paperwork and spend, not a substitute for seeing and driving the car yourself.
        </p>

        <SectionHeading icon={HelpCircle} id="questions">Questions worth asking the seller</SectionHeading>
        <ol className={styles.questionsList}>
          {detailedQuestions.map((q, i) => <li key={i}>{q}</li>)}
        </ol>

        <SectionHeading icon={ListOrdered}>Buyer action plan</SectionHeading>
        <ol className={styles.questionsList}>
          {buyerActionPlan.map((step, i) => (
            <li key={i}>
              <strong>{step.stage}:</strong> {step.detail}
            </li>
          ))}
        </ol>

        <SectionHeading icon={Gauge}>Confidence and limitations</SectionHeading>
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
          <SectionHeading icon={ClipboardCheck} id="mot-history">MOT history (DVSA-verified)</SectionHeading>
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

      {car.dvlaData && (car.dvlaData.keeperChangeList.length > 0 || car.dvlaData.v5cIssueDates.length > 0) && (
        <>
          <SectionHeading icon={Users} id="ownership-history">Ownership history (DVLA-verified)</SectionHeading>
          <p className={styles.docParagraph}>
            Recorded directly with DVLA, independent of anything logged in RoadVerdict.
          </p>
          {car.dvlaData.keeperChangeList.length > 0 && (
            <dl className={styles.itemByItemList}>
              {car.dvlaData.keeperChangeList.slice().reverse().map((k, i) => (
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
          {car.dvlaData.v5cIssueDates.length > 0 && (
            <dl className={styles.itemByItemList}>
              {car.dvlaData.v5cIssueDates.slice().reverse().map((d, i) => (
                <div key={`v5c-${i}`} className={styles.itemByItemRow}>
                  <dt>{fmtDate(d)}</dt>
                  <dd>V5C logbook issued{i === 0 && car.dvlaData!.v5cIssueDates.length > 1 ? ' (most recent)' : ''}</dd>
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
          <p className={styles.upcomingTitle} id="whats-coming-up">What&apos;s coming up</p>
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
            Timing is based on this car&apos;s own logged intervals, not a generic assumption. Where a cost is
            shown, it&apos;s an indicative benchmark against typical UK prices for this size of car, not a quote
            for this specific car or garage - treat both as helpful estimates, not guarantees.
          </p>
        </div>
      )}

      {negotiationSummary && (
        <>
          <SectionHeading icon={Handshake}>Negotiation points</SectionHeading>
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
            This isn&apos;t a suggested offer or a valuation - RoadVerdict doesn&apos;t estimate what this car is
            worth, just factual points from this record worth raising before agreeing a price.
          </p>
        </>
      )}

      <SectionHeading icon={Table2} id="full-record">Full logged history</SectionHeading>
      <CarReportHistoryTable
        rows={rows}
        total={total}
        car={car}
        token={params.token}
        backdatedCount={backdatedCount}
        realTimeCount={realTimeCount}
        receiptCount={receiptCount}
        entryRequestStatus={data.entryRequestStatus}
      />

      {showRequestHistoryCta && currentRegistration && (
        <CarRequestHistoryCta
          registration={currentRegistration}
          signedInEmail={viewerSession?.email ?? null}
          currentPath={`/car-report/${params.token}/detailed`}
        />
      )}

      <p className={styles.caveat}>
        This report describes patterns in the logged record - what was entered, when, and how completely - not a
        judgement of the owner or an inspection of the car itself. This history is self-reported and has not been
        independently verified against DVSA MOT records. Fuel spend is not included, since it isn&apos;t relevant to
        a buyer. Generated {fmtDate(new Date().toISOString())}.
      </p>
    </div>
  );
}
