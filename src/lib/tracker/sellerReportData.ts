// Place at: src/lib/tracker/sellerReportData.ts
import { notFound } from "next/navigation";
import { resolveShareToken } from "@/lib/tracker/shareLink";
import { getBike, getCurrentRegistration } from "@/lib/tracker/bike";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getMods } from "@/lib/tracker/mod";
import { getBills } from "@/lib/tracker/bill";
import { getFuelLogs } from "@/lib/tracker/fuelLog";
import { getReminders, type ReminderDoc } from "@/lib/tracker/reminder";
import { computeReminderStatus } from "@/lib/tracker/reminderStatus";
import { findMileageMonotonicityViolations } from "@/lib/tracker/mileageAudit";
import { computeSellerVerdict, type SellerVerdictMetrics, type SellerVerdictResult } from "@/lib/tracker/sellerReportVerdict";
import { generateBuyerQuestions } from "@/lib/tracker/reportQuestions";
import { findConsumablesDueSoon, type ConsumableDueSoon } from "@/lib/tracker/consumablesDueSoon";
import { buildUpcomingCostItems, type UpcomingCostItem } from "@/lib/tracker/upcomingCosts";
import { getBikeClassForCC } from "@/lib/motorcycleModels";
import { buildEvidenceQuality, type EvidenceQuality } from "./evidenceQuality";
import { getReceiptRequestsForShareToken, canSendReminder } from "@/lib/tracker/receiptRequest";
import {
  checkCurrentMileagePlausibility,
  groupServiceHistoryByJobType,
  generateStoryParagraphs,
  generateSupportedAndUnconfirmed,
  generateDetailedQuestions,
  type JobTypeGroup,
  type MileagePlausibilityCheck,
} from "@/lib/tracker/reportNarrative";
import { JOB_LABELS } from "@/lib/tracker/jobTypes";
import { MOD_LABELS } from "@/lib/tracker/modTypes";
import { BILL_LABELS } from "@/lib/tracker/billTypes";
import { isBackdated, backdateNotice, detectBulkBackdating, type BackdateCheckItem, type BulkBackdateCluster } from "@/lib/tracker/backdateCheck";
import type { Attachment } from "@/lib/tracker/cosmosHelpers";
import type { BikeDoc } from "@/lib/tracker/bike";
import type { ServiceRecordDoc } from "@/lib/tracker/serviceRecord";
import type { ModDoc } from "@/lib/tracker/mod";
import type { BillDoc } from "@/lib/tracker/bill";
import type { FuelLogDoc } from "@/lib/tracker/fuelLog";

export interface ReportRow {
  id: string;
  date: string;
  createdAt: string;
  category: string;
  description: string;
  cost: number;
  attachment: Attachment | null;
}

export interface EntryRequestStatus {
  status: "pending" | "approved" | "declined";
  reason?: string;
  requestCreatedAt: string;
  canRemind: boolean;
}

export interface SellerReportData {
  token: string;
  bike: BikeDoc;
  rows: ReportRow[];
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
  upcomingReminders: { reminder: ReminderDoc; status: "due-soon" | "overdue" }[];
  consumablesDueSoon: ConsumableDueSoon[];
  upcomingCostItems: UpcomingCostItem[];
  evidenceQuality: EvidenceQuality;
  motCheckUrl: string;
  // Entries this specific report link already has permission to show
  // the real receipt for - re-checked fresh on every page load, so a
  // decision the owner just made shows up the next time this same link
  // is visited, no caching to go stale.
  entryRequestStatus: Record<string, EntryRequestStatus>;
  // The seller's own choice for this specific link, not the bike -
  // see shareLink.ts for why it lives there. Never on SellerReportCore,
  // since the owner's own dashboard reuses that same core data with no
  // concept of "which link" at all.
  askingPrice?: number;
  // Narrative report content - see reportNarrative.ts for how each
  // piece is derived; nothing here is free text, every sentence traces
  // to a specific computed fact.
  mileageCheck: MileagePlausibilityCheck;
  storyParagraphs: string[];
  jobTypeGroups: JobTypeGroup[];
  supportedFindings: string[];
  unconfirmedFindings: string[];
  detailedQuestions: string[];
}

export interface SellerReportCore {
  bike: BikeDoc;
  rows: ReportRow[];
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
  upcomingReminders: { reminder: ReminderDoc; status: "due-soon" | "overdue" }[];
  consumablesDueSoon: ConsumableDueSoon[];
  upcomingCostItems: UpcomingCostItem[];
  evidenceQuality: EvidenceQuality;
  motCheckUrl: string;
  mileageCheck: MileagePlausibilityCheck;
  storyParagraphs: string[];
  jobTypeGroups: JobTypeGroup[];
  supportedFindings: string[];
  unconfirmedFindings: string[];
  detailedQuestions: string[];
}

// The actual report computation - everything that depends only on
// email/bikeId, not on any particular share token. Pulled out so the
// owner's own dashboard (authenticated by session, no token at all) can
// compute exactly the same facts a buyer would eventually see, from the
// same raw records, rather than a second implementation that could
// silently drift from this one. getSellerReportData below is now just
// this plus token resolution and the token-specific receipt-request
// status lookup.
// Pulled out of getSellerReportCore so a readiness check (does this
// bike currently have enough logged to be worth generating a report
// or story from?) can reuse the exact same metrics the real report is
// judged by, without a second round of database queries - this takes
// already-fetched records/mods/bills/fuelLogs/reminders as plain
// arguments rather than fetching them itself. getSellerReportCore
// below still needs several of these values (rows, total, clusters,
// registration info) for its own further computation, so this returns
// all of them, not just the verdict metrics - the readiness check
// only reads the one field it actually needs.
export function computeSellerReportRowsAndMetrics(
  bike: BikeDoc,
  records: ServiceRecordDoc[],
  mods: ModDoc[],
  bills: BillDoc[],
  fuelLogs: FuelLogDoc[],
  reminders: ReminderDoc[]
) {
  const rows: ReportRow[] = [
    ...records.map((r) => ({ id: r.id, date: r.date, createdAt: r.createdAt, category: "Service", description: JOB_LABELS[r.jobType] ?? r.jobType, cost: r.cost, attachment: r.attachments?.[0] ?? null })),
    ...mods.map((m) => ({ id: m.id, date: m.date, createdAt: m.createdAt, category: "Modification", description: `${MOD_LABELS[m.category] ?? m.category}: ${m.name}`, cost: m.cost, attachment: m.attachments?.[0] ?? null })),
    ...bills.map((b) => ({ id: b.id, date: b.date, createdAt: b.createdAt, category: "Bill", description: BILL_LABELS[b.billType] ?? b.billType, cost: b.cost, attachment: b.attachments?.[0] ?? null })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const total = rows.reduce((sum, r) => sum + r.cost, 0);

  const backdateItems: BackdateCheckItem[] = rows.map((r) => ({ id: r.id, date: r.date, createdAt: r.createdAt, hasAttachment: !!r.attachment }));
  const clusters = detectBulkBackdating(backdateItems);
  const backdatedCount = rows.filter((r) => isBackdated(r.date, r.createdAt)).length;
  const realTimeCount = rows.length - backdatedCount;
  const receiptCount = rows.filter((r) => r.attachment).length;

  const registrationChanges = bike.registrationChanges ?? [];
  const currentRegistration = getCurrentRegistration(bike);
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

  const sortedRowDates = rows.map((r) => new Date(r.date).getTime()).sort((a, b) => a - b);
  let longestGapDays = 0;
  for (let i = 1; i < sortedRowDates.length; i++) {
    longestGapDays = Math.max(longestGapDays, Math.round((sortedRowDates[i] - sortedRowDates[i - 1]) / 86400000));
  }
  const spanYears = sortedRowDates.length >= 2 ? (sortedRowDates[sortedRowDates.length - 1] - sortedRowDates[0]) / (86400000 * 365) : 0;

  const overdueReminderCount = reminders.filter((r) => computeReminderStatus(r, bike.currentMileage) === "overdue").length;

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

export async function getSellerReportCore(email: string, bikeId: string): Promise<SellerReportCore> {
  const bike = await getBike(email, bikeId);
  if (!bike) notFound();

  const [records, mods, bills, fuelLogs, reminders] = await Promise.all([
    getServiceRecords(email, bikeId),
    getMods(email, bikeId),
    getBills(email, bikeId),
    getFuelLogs(email, bikeId),
    getReminders(email, bikeId),
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
  } = computeSellerReportRowsAndMetrics(bike, records, mods, bills, fuelLogs, reminders);

  const verdict = computeSellerVerdict(verdictMetrics);
  const buyerQuestions = generateBuyerQuestions(verdictMetrics);

  const upcomingReminders = reminders
    .map((r) => ({ reminder: r, status: computeReminderStatus(r, bike.currentMileage) }))
    .filter((x): x is { reminder: ReminderDoc; status: "due-soon" | "overdue" } => x.status === "due-soon" || x.status === "overdue")
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "overdue" ? -1 : 1));

  const activeReminderJobTypes = new Set(
    reminders.map((r) => r.sourceKey).filter((k): k is string => Boolean(k?.startsWith("service:"))).map((k) => k.slice("service:".length))
  );
  const consumablesDueSoon = findConsumablesDueSoon(
    records.map((r) => ({ jobType: r.jobType, mileage: r.mileage, date: r.date })),
    bike.currentMileage,
    activeReminderJobTypes
  );

  const mileageCheck = checkCurrentMileagePlausibility(bike.currentMileage, bike);
  const jobTypeGroups = groupServiceHistoryByJobType(
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
  const { supported: supportedFindings, unconfirmed: unconfirmedFindings } = generateSupportedAndUnconfirmed(
    jobTypeGroups,
    mileageCheck,
    hasTyreEntries
  );
  const detailedQuestions = generateDetailedQuestions(jobTypeGroups, Boolean(otherGroup), hasTyreEntries);
  const upcomingCostItems = buildUpcomingCostItems(upcomingReminders, consumablesDueSoon, getBikeClassForCC(bike.engineCC));
  const evidenceQuality = buildEvidenceQuality(rows.length, receiptCount, realTimeCount, verdictMetrics.longestGapDays, verdictMetrics.mileageViolationCount);

  return {
    bike,
    rows,
    total,
    clusters,
    backdatedCount,
    realTimeCount,
    receiptCount,
    currentRegistration: currentRegistration ?? null,
    registrationChangesCount: registrationChanges.length,
    originalRegistration: bike.originalRegistration,
    mostRecentChangeDate: mostRecentChange?.changedAt ?? null,
    daysSinceLastChange,
    dateAdded: bike.dateAdded,
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

export async function getSellerReportData(token: string): Promise<SellerReportData> {
  const resolved = await resolveShareToken(token);
  if (!resolved) notFound();
  const { email, bikeId, askingPrice } = resolved;

  const core = await getSellerReportCore(email, bikeId);

  const requests = await getReceiptRequestsForShareToken(email, token);
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
        canRemind: canSendReminder(r),
      };
    }
  }

  return { token, ...core, entryRequestStatus, askingPrice };
}
