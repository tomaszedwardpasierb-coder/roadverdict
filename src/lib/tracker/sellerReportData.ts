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
import { JOB_LABELS } from "@/lib/tracker/jobTypes";
import { MOD_LABELS } from "@/lib/tracker/modTypes";
import { BILL_LABELS } from "@/lib/tracker/billTypes";
import { isBackdated, backdateNotice, detectBulkBackdating, type BackdateCheckItem, type BulkBackdateCluster } from "@/lib/tracker/backdateCheck";
import type { Attachment } from "@/lib/tracker/cosmosHelpers";
import type { BikeDoc } from "@/lib/tracker/bike";

export interface ReportRow {
  id: string;
  date: string;
  createdAt: string;
  category: string;
  description: string;
  cost: number;
  attachment: Attachment | null;
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
  motCheckUrl: string;
}

export async function getSellerReportData(token: string): Promise<SellerReportData> {
  const resolved = await resolveShareToken(token);
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
  const buyerQuestions = generateBuyerQuestions(verdictMetrics);

  return {
    token,
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
    motCheckUrl: "https://www.check-mot.service.gov.uk/",
  };
}
