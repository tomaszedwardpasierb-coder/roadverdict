// Place at: src/lib/app/storyData.ts
//
// The Android app's The Story So Far for one vehicle: the story already
// generated for it (read from its cache, never generated here - the app
// generates one through the web's own story-so-far routes), and the
// web tab's "Getting ready to sell" section, built exactly as the
// dashboard builds it (see dashboard/page.tsx) from the same seller
// report core a buyer's report uses. The whole tab is Pro on the web,
// so a free account gets neither.
import { getBike } from "@/lib/tracker/bike";
import { getCarById } from "@/lib/tracker/car";
import type { VehicleKind } from "@/lib/tracker/activeVehicle";
import { getSellerReportCore } from "@/lib/tracker/sellerReportData";
import { getCarSellerReportCore } from "@/lib/tracker/carSellerReportData";
import { buildWalkAwayIssues } from "@/lib/tracker/walkAwayRisks";
import { buildCarWalkAwayIssues } from "@/lib/tracker/carWalkAwayRisks";
import { buildSellerPrepIssues, buildSellerPrepPlan, type PrepStep, type SellerPrepIssue } from "@/lib/tracker/sellerPrep";
import type { EvidenceQuality } from "@/lib/tracker/evidenceQuality";
import type { UpcomingCostItem } from "@/lib/tracker/upcomingCosts";
import { getProStatus } from "@/lib/subscriptions";
import { STORY_COOLDOWN_MS } from "@/lib/tracker/storyCooldown";

export type StoryData = {
  isPro: boolean;
  story: { sharedStory: string[]; ownerNotes: string[]; verdictLabel: string; generatedAt: string; nextAvailableAt: string } | null;
  sellerPrep: {
    totalRecords: number;
    receiptCoveragePct: number;
    realTimePct: number;
    mileageConsistent: boolean;
    issues: SellerPrepIssue[];
    // "typically £X-£Y" when the job has a sourced price, as the web says it.
    upcoming: { label: string; timingDetail: string; overdue: boolean; typical: string | null }[];
    questions: string[];
    plan: PrepStep[];
  } | null;
};

type StoryCache = { generatedAt: string; response: { sharedStory?: string[]; ownerNotes?: string[]; verdict?: { label?: string } } };

function cachedStory(cache: StoryCache | undefined): StoryData["story"] {
  if (!cache) return null;
  return {
    sharedStory: cache.response.sharedStory ?? [],
    ownerNotes: cache.response.ownerNotes ?? [],
    verdictLabel: cache.response.verdict?.label ?? "",
    generatedAt: cache.generatedAt,
    nextAvailableAt: new Date(new Date(cache.generatedAt).getTime() + STORY_COOLDOWN_MS).toISOString(),
  };
}

function sellerPrep(
  evidenceQuality: EvidenceQuality,
  walkAwayCount: number,
  issues: SellerPrepIssue[],
  upcomingCostItems: Pick<UpcomingCostItem, "label" | "timing" | "timingDetail" | "pricing">[],
  questions: string[]
): NonNullable<StoryData["sellerPrep"]> {
  return {
    totalRecords: evidenceQuality.totalRecords,
    receiptCoveragePct: evidenceQuality.receiptCoveragePct,
    realTimePct: evidenceQuality.realTimePct,
    mileageConsistent: evidenceQuality.mileageInternallyConsistent,
    issues,
    upcoming: upcomingCostItems.map((item) => ({
      label: item.label,
      timingDetail: item.timingDetail,
      overdue: item.timing === "overdue",
      typical: item.pricing.status === "priced" ? `typically £${item.pricing.low}-£${item.pricing.high}` : null,
    })),
    questions,
    plan: buildSellerPrepPlan(
      evidenceQuality.receiptCoveragePct,
      walkAwayCount,
      upcomingCostItems.filter((i) => i.timing === "overdue").length,
      questions.length
    ),
  };
}

export async function getStory(email: string, kind: VehicleKind, id: string): Promise<StoryData | null> {
  // Looked up inside this account's own partition first: the seller
  // cores answer a missing vehicle with Next's notFound(), which is for
  // pages, not an API route.
  const [vehicle, pro] = await Promise.all([kind === "bike" ? getBike(email, id) : getCarById(email, id), getProStatus(email)]);
  if (!vehicle) return null;
  if (!pro.isPro) return { isPro: false, story: null, sellerPrep: null };

  if (kind === "bike") {
    const core = await getSellerReportCore(email, id);
    const walkAway = buildWalkAwayIssues(core.bike, core.mileageCheck, core.evidenceQuality);
    return {
      isPro: true,
      story: cachedStory(core.bike.storyCache),
      sellerPrep: sellerPrep(core.evidenceQuality, walkAway.length, buildSellerPrepIssues(walkAway), core.upcomingCostItems, core.detailedQuestions),
    };
  }
  const core = await getCarSellerReportCore(email, id);
  const walkAway = buildCarWalkAwayIssues(core.car, core.mileageCheck, core.evidenceQuality);
  return {
    isPro: true,
    story: cachedStory(core.car.storyCache),
    sellerPrep: sellerPrep(core.evidenceQuality, walkAway.length, buildSellerPrepIssues(walkAway), core.upcomingCostItems, core.detailedQuestions),
  };
}
