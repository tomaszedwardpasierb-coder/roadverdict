// Place at: src/lib/tracker/carSellerReportData.ts
//
// Car equivalent of sellerReportData.ts.
import { notFound } from "next/navigation";
import { getCarById, getCurrentRegistration, isCarReadOnly, type CarDoc } from "@/lib/tracker/car";
import { materializeAllDueForCar } from "@/lib/tracker/carBillSeries";
import { resolveCarShareToken } from "@/lib/tracker/carShareLink";
import { getCarReceiptRequestsForShareToken, canSendCarReminder } from "@/lib/tracker/carReceiptRequest";
import type { EntryRequestStatus } from "@/lib/tracker/sellerReportData";
import { getCarServiceRecords } from "@/lib/tracker/carServiceRecord";
import { getCarMods } from "@/lib/tracker/carMod";
import { getCarBills } from "@/lib/tracker/carBill";
import { getCarFuelLogs } from "@/lib/tracker/carFuelLog";
import { getCarReminders } from "@/lib/tracker/carReminder";
import { computeCarReminderStatus } from "@/lib/tracker/carReminderStatus";
import type { CarReminderDoc } from "@/lib/tracker/carReminder";
import { findMileageMonotonicityViolations } from "@/lib/tracker/mileageAudit";
import { computeSellerVerdict, type SellerVerdictMetrics, type SellerVerdictResult } from "@/lib/tracker/sellerReportVerdict";
import { generateCarBuyerQuestions } from "@/lib/tracker/carReportQuestions";
import { findCarConsumablesDueSoon, type CarConsumableDueSoon } from "@/lib/tracker/carConsumablesDueSoon";
import { buildCarUpcomingCostItems, type CarUpcomingCostItem } from "@/lib/tracker/carUpcomingCosts";
import { buildEvidenceQuality, type EvidenceQuality } from "./evidenceQuality";
import {
  checkCurrentCarMileagePlausibility,
  groupCarServiceHistoryByJobType,
  generateCarSupportedAndUnconfirmed,
  generateCarDetailedQuestions,
  type CarMileagePlausibilityCheck,
} from "@/lib/tracker/carReportNarrative";
import { generateStoryParagraphs, type JobTypeGroup } from "@/lib/tracker/reportNarrative";
import { CAR_JOB_LABELS } from "@/lib/tracker/carJobTypes";
import { CAR_MOD_LABELS } from "@/lib/tracker/carModTypes";
import { CAR_BILL_LABELS } from "@/lib/tracker/carBillTypes";
import { isBackdated, detectBulkBackdating, type BackdateCheckItem, type BulkBackdateCluster } from "@/lib/tracker/backdateCheck";
import type { Attachment } from "@/lib/tracker/cosmosHelpers";
import type { CarServiceRecordDoc } from "@/lib/tracker/carServiceRecord";
import type { CarModDoc } from "@/lib/tracker/carMod";
import type { CarBillDoc } from "@/lib/tracker/carBill";
import type { CarFuelLogDoc } from "@/lib/tracker/carFuelLog";
import type { CarBenchmarkClass } from "@/lib/carPriceData";

export interface CarReportRow {
  id: string;
  date: string;
  createdAt: string;
  category: string;
  description: string;
  cost: number;
  attachment: Attachment | null;
}

export interface CarSellerReportCore {
  car: CarDoc;
  rows: CarReportRow[];
  total: number;
  clusters: BulkBackdateCluster[];
  backdatedCount: number;
  realTimeCount: number;
  receiptCount: number;
  currentRegistration: string | null;
  registrationChangesCount: number;
  originalRegistration?: string;
  mostRecentChangeDate: string | null;
  daysSinceLastChange: number | null;
  dateAdded: string;
  verdict: SellerVerdictResult;
  buyerQuestions: string[];
  upcomingReminders: { reminder: CarReminderDoc; status: "due-soon" | "overdue" }[];
  consumablesDueSoon: CarConsumableDueSoon[];
  upcomingCostItems: CarUpcomingCostItem[];
  evidenceQuality: EvidenceQuality;
  motCheckUrl: string;
  mileageCheck: CarMileagePlausibilityCheck;
  storyParagraphs: string[];
  jobTypeGroups: JobTypeGroup[];
  supportedFindings: string[];
  unconfirmedFindings: string[];
  detailedQuestions: string[];
}

export interface CarSellerReportData extends CarSellerReportCore {
  token: string;
  // Entries this specific report link already has permission to show
  // the real receipt for - re-checked fresh on every page load, so a
  // decision the owner just made shows up the next time this same link
  // is visited, no caching to go stale.
  entryRequestStatus: Record<string, EntryRequestStatus>;
  // The seller's own choice for this specific link, not the car - see
  // carShareLink.ts for why it lives there.
  askingPrice?: number;
}

// Duplicated from dashboard/page.tsx and the /cars/quote-checker etc
// standalone pages (none of which share it with each other either) -
// the existing convention for this small helper in this codebase.
// Electric cars have no engineLitres to classify by; 'medium' is a safe
// placeholder here since buildCarUpcomingCostItems' own pricing gate
// (isBenchmarkedCarJob) already excludes every current car benchmark
// from applying to an EV-only job type regardless of class.
function classFromEngineLitres(engineLitres: number | undefined): CarBenchmarkClass {
  if (engineLitres == null) return "medium";
  if (engineLitres <= 1.2) return "small";
  if (engineLitres <= 2.0) return "medium";
  return "large";
}

export function computeCarSellerReportRowsAndMetrics(
  car: CarDoc,
  records: CarServiceRecordDoc[],
  mods: CarModDoc[],
  bills: CarBillDoc[],
  fuelLogs: CarFuelLogDoc[],
  reminders: CarReminderDoc[]
) {
  // Same reasoning as sellerReportData.ts's own isHiddenFromBuyer: a
  // future owner's own insurance/finance is specific to THEM, never
  // predictive of this car.
  const isHiddenFromBuyer = (billType: string): boolean =>
    (billType === "insurance" && !car.includeInsuranceInReport) ||
    (billType === "finance" && !car.includeFinanceInReport);

  const allRows: (CarReportRow & { hiddenFromBuyer: boolean })[] = [
    ...records.map((r) => ({ id: r.id, date: r.date, createdAt: r.createdAt, category: "Service", description: CAR_JOB_LABELS[r.jobType] ?? r.jobType, cost: r.cost, attachment: r.attachments?.[0] ?? null, hiddenFromBuyer: false })),
    ...mods.map((m) => ({ id: m.id, date: m.date, createdAt: m.createdAt, category: "Modification", description: `${CAR_MOD_LABELS[m.category] ?? m.category}: ${m.name}`, cost: m.cost, attachment: m.attachments?.[0] ?? null, hiddenFromBuyer: false })),
    ...bills.map((b) => ({
      id: b.id,
      date: b.date,
      createdAt: b.createdAt,
      category: "Bill",
      description: CAR_BILL_LABELS[b.billType] ?? b.billType,
      cost: b.cost,
      attachment: b.attachments?.[0] ?? null,
      hiddenFromBuyer: isHiddenFromBuyer(b.billType),
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const rows: CarReportRow[] = allRows.filter((r) => !r.hiddenFromBuyer).map(({ hiddenFromBuyer, ...row }) => row);
  const total = rows.reduce((sum, r) => sum + r.cost, 0);

  // Trust/documentation signals below are computed from EVERY logged
  // entry, hidden-from-buyer ones included - see isHiddenFromBuyer above.
  const backdateItems: BackdateCheckItem[] = allRows.map((r) => ({ id: r.id, date: r.date, createdAt: r.createdAt, hasAttachment: !!r.attachment }));
  const clusters = detectBulkBackdating(backdateItems);
  const backdatedCount = allRows.filter((r) => isBackdated(r.date, r.createdAt)).length;
  const realTimeCount = allRows.length - backdatedCount;
  const receiptCount = allRows.filter((r) => r.attachment).length;

  const registrationChanges = car.registrationChanges ?? [];
  const currentRegistration = getCurrentRegistration(car);
  const mostRecentChange = registrationChanges[registrationChanges.length - 1];
  const daysSinceLastChange = mostRecentChange
    ? Math.round((Date.now() - new Date(mostRecentChange.changedAt).getTime()) / 86400000)
    : null;

  const entriesInBulkClusters = clusters.reduce((sum, c) => sum + c.count, 0);
  const largestClusterSpanDays = clusters.reduce((max, c) => Math.max(max, c.spanDays), 0);

  const mileagePoints = [
    ...records.map((r) => ({ id: r.id, date: r.date, mileage: r.mileage, mileageConfidence: r.mileageConfidence })),
    ...fuelLogs.map((f) => ({ id: f.id, date: f.date, mileage: f.mileage, mileageConfidence: f.mileageConfidence })),
    ...mods.map((m) => ({ id: m.id, date: m.date, mileage: m.mileage, mileageConfidence: m.mileageConfidence })),
  ];
  const mileageViolationCount = findMileageMonotonicityViolations(mileagePoints).length;

  const sortedRowDates = allRows.map((r) => new Date(r.date).getTime()).sort((a, b) => a - b);
  let longestGapDays = 0;
  for (let i = 1; i < sortedRowDates.length; i++) {
    longestGapDays = Math.max(longestGapDays, Math.round((sortedRowDates[i] - sortedRowDates[i - 1]) / 86400000));
  }
  const spanYears = sortedRowDates.length >= 2 ? (sortedRowDates[sortedRowDates.length - 1] - sortedRowDates[0]) / (86400000 * 365) : 0;

  const overdueReminderCount = reminders.filter((r) => computeCarReminderStatus(r, car.currentMileage) === "overdue").length;

  const verdictMetrics: SellerVerdictMetrics = {
    totalEntries: allRows.length,
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

  return {
    rows,
    total,
    backdatedCount,
    realTimeCount,
    receiptCount,
    clusters,
    registrationChanges,
    currentRegistration,
    mostRecentChange,
    daysSinceLastChange,
    verdictMetrics,
  };
}

export async function getCarSellerReportCore(email: string, carId: string): Promise<CarSellerReportCore> {
  const car = await getCarById(email, carId);
  if (!car) notFound();

  // Same lazy-materialisation call as the car dashboard - a buyer
  // opening a share link (or the owner's own Story/Reports tabs, which
  // reuse this exact core) should never see an instalment plan stuck
  // showing stale, un-materialised payments just because nobody happened
  // to load the dashboard first. Skipped for a transferred (read-only)
  // car, same reasoning as the dashboard's own call.
  if (!isCarReadOnly(car)) {
    await materializeAllDueForCar(email, carId);
  }

  const [records, mods, bills, fuelLogs, reminders] = await Promise.all([
    getCarServiceRecords(email, carId),
    getCarMods(email, carId),
    getCarBills(email, carId),
    getCarFuelLogs(email, carId),
    getCarReminders(email, carId),
  ]);

  const {
    rows,
    total,
    backdatedCount,
    realTimeCount,
    receiptCount,
    clusters,
    registrationChanges,
    currentRegistration,
    mostRecentChange,
    daysSinceLastChange,
    verdictMetrics,
  } = computeCarSellerReportRowsAndMetrics(car, records, mods, bills, fuelLogs, reminders);

  const verdict = computeSellerVerdict(verdictMetrics);
  const buyerQuestions = generateCarBuyerQuestions(verdictMetrics);

  const upcomingReminders = reminders
    .map((r) => ({ reminder: r, status: computeCarReminderStatus(r, car.currentMileage) }))
    .filter((x): x is { reminder: CarReminderDoc; status: "due-soon" | "overdue" } => x.status === "due-soon" || x.status === "overdue")
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "overdue" ? -1 : 1));

  const activeReminderJobTypes = new Set(
    reminders.map((r) => r.sourceKey).filter((k): k is string => Boolean(k?.startsWith("service:"))).map((k) => k.slice("service:".length))
  );
  const consumablesDueSoon = findCarConsumablesDueSoon(
    records.map((r) => ({ jobType: r.jobType, mileage: r.mileage, date: r.date })),
    car.currentMileage,
    activeReminderJobTypes
  );

  const mileageCheck = checkCurrentCarMileagePlausibility(car.currentMileage, car);
  const jobTypeGroups = groupCarServiceHistoryByJobType(
    records.map((r) => ({ id: r.id, jobType: r.jobType, date: r.date, cost: r.cost, hasReceipt: !!r.attachments?.[0] }))
  );
  const totalExactDuplicates = jobTypeGroups.reduce((sum, g) => sum + g.exactDuplicateCount, 0);
  const otherGroup = jobTypeGroups.find((g) => g.jobType === "other");
  const largestCluster = clusters.reduce<(typeof clusters)[number] | null>(
    (max, c) => (!max || c.count > max.count ? c : max),
    null
  );
  const storyParagraphs = generateStoryParagraphs({
    totalEntries: rows.length,
    totalSpend: total,
    backdatedCount,
    receiptCount,
    largestClusterCount: largestCluster?.count ?? 0,
    largestClusterDate: largestCluster?.loggedAt ?? null,
    totalExactDuplicates,
    otherCount: otherGroup?.count ?? 0,
    otherMinCost: otherGroup?.minCost ?? 0,
    otherMaxCost: otherGroup?.maxCost ?? 0,
  });
  const hasTyreEntries = jobTypeGroups.some((g) => g.jobType.startsWith("tyres-"));
  const { supported: supportedFindings, unconfirmed: unconfirmedFindings } = generateCarSupportedAndUnconfirmed(
    jobTypeGroups,
    mileageCheck,
    hasTyreEntries
  );
  const detailedQuestions = generateCarDetailedQuestions(jobTypeGroups, Boolean(otherGroup), hasTyreEntries);
  const upcomingCostItems = buildCarUpcomingCostItems(upcomingReminders, consumablesDueSoon, classFromEngineLitres(car.engineLitres));
  const evidenceQuality = buildEvidenceQuality(rows.length, receiptCount, realTimeCount, verdictMetrics.longestGapDays, verdictMetrics.mileageViolationCount);

  return {
    car,
    rows,
    total,
    clusters,
    backdatedCount,
    realTimeCount,
    receiptCount,
    currentRegistration: currentRegistration ?? null,
    registrationChangesCount: registrationChanges.length,
    originalRegistration: car.originalRegistration,
    mostRecentChangeDate: mostRecentChange?.changedAt ?? null,
    daysSinceLastChange,
    dateAdded: car.dateAdded,
    verdict,
    buyerQuestions,
    upcomingReminders,
    consumablesDueSoon,
    upcomingCostItems,
    evidenceQuality,
    motCheckUrl: "https://www.check-mot.service.gov.uk/",
    mileageCheck,
    storyParagraphs,
    jobTypeGroups,
    supportedFindings,
    unconfirmedFindings,
    detailedQuestions,
  };
}

export async function getCarSellerReportData(token: string): Promise<CarSellerReportData> {
  const resolved = await resolveCarShareToken(token);
  if (!resolved) notFound();
  const { email, carId, askingPrice } = resolved;

  const core = await getCarSellerReportCore(email, carId);

  const requests = await getCarReceiptRequestsForShareToken(email, token);
  // Most recent request wins per entry - handles "declined, then asked
  // again" correctly, since the newer request's pending status should
  // take precedence over an older decline for display purposes.
  const entryRequestStatus: Record<string, EntryRequestStatus> = {};
  for (const r of [...requests].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())) {
    for (const item of r.items) {
      entryRequestStatus[item.entryId] = {
        status: item.status,
        reason: item.reason,
        requestCreatedAt: r.createdAt,
        canRemind: canSendCarReminder(r),
      };
    }
  }

  return { token, ...core, entryRequestStatus, askingPrice };
}
