// Place at: src/lib/tracker/storyFacts.ts
//
// Everything Story So Far needs that sellerReportData.ts's core doesn't
// already compute - identity/shape, spend by category, service rhythm,
// and the fuel-efficiency trend. Same house style as reportNarrative.ts:
// every number here is counted or compared, never estimated or
// inferred about the person behind it. This file only produces facts;
// turning them into prose (deterministic or LLM-assisted) is a
// separate, later step.

import type { BikeDoc } from "@/lib/tracker/bike";
import { computeMPGSeries, type MpgCalcInput } from "@/lib/tracker/mpgCalc";
import { JOB_LABELS } from "@/lib/tracker/jobTypes";

export interface CategorySpend {
  category: "Service" | "Fuel" | "Modifications" | "Bills";
  total: number;
  count: number;
}

export interface ServiceRhythm {
  serviceCount: number;
  // Gaps between consecutive service dates, sorted oldest-first pair by
  // pair - only meaningful with at least two service records.
  averageGapDays: number | null;
  longestGapDays: number | null;
  longestGapStartDate: string | null;
  longestGapEndDate: string | null;
}

export interface MpgTrend {
  hasEnoughData: boolean;
  overallAverageMpg: number | null;
  // Average of the most recent fill-ups only (up to RECENT_SEGMENT_COUNT),
  // excluding anything already flagged as an anomaly by mpgCalc.ts
  // itself - never recomputed or re-judged here.
  recentAverageMpg: number | null;
  recentSegmentCount: number;
  anomalyCount: number;
}

const RECENT_SEGMENT_COUNT = 5;

export interface BikeIdentity {
  make: string;
  model: string;
  year?: number;
  currentMileage: number;
  loggedSinceDate: string;
  loggedSpanYears: number;
  totalLoggedEvents: number;
}

export function computeBikeIdentity(
  bike: Pick<BikeDoc, "make" | "model" | "year" | "currentMileage" | "dateAdded">,
  totalLoggedEvents: number
): BikeIdentity {
  const loggedSpanYears = (Date.now() - new Date(bike.dateAdded).getTime()) / (86_400_000 * 365);
  return {
    make: bike.make,
    model: bike.model,
    year: bike.year,
    currentMileage: bike.currentMileage,
    loggedSinceDate: bike.dateAdded,
    loggedSpanYears,
    totalLoggedEvents,
  };
}

export function computeCategorySpend(rows: { category: string; cost: number }[], fuelTotal: number, fuelCount: number): CategorySpend[] {
  const byCategory = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    const entry = byCategory.get(r.category) ?? { total: 0, count: 0 };
    entry.total += r.cost;
    entry.count += 1;
    byCategory.set(r.category, entry);
  }

  const result: CategorySpend[] = [
    { category: "Service", total: byCategory.get("Service")?.total ?? 0, count: byCategory.get("Service")?.count ?? 0 },
    { category: "Fuel", total: fuelTotal, count: fuelCount },
    { category: "Modifications", total: byCategory.get("Modification")?.total ?? 0, count: byCategory.get("Modification")?.count ?? 0 },
    { category: "Bills", total: byCategory.get("Bill")?.total ?? 0, count: byCategory.get("Bill")?.count ?? 0 },
  ];

  return result.sort((a, b) => b.total - a.total);
}

export function computeServiceRhythm(records: { date: string }[]): ServiceRhythm {
  if (records.length < 2) {
    return { serviceCount: records.length, averageGapDays: null, longestGapDays: null, longestGapStartDate: null, longestGapEndDate: null };
  }
  const sorted = [...records].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const gaps: { days: number; start: string; end: string }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const days = Math.round((new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()) / 86_400_000);
    gaps.push({ days, start: sorted[i - 1].date, end: sorted[i].date });
  }
  const longest = gaps.reduce((max, g) => (g.days > max.days ? g : max), gaps[0]);
  const averageGapDays = Math.round(gaps.reduce((sum, g) => sum + g.days, 0) / gaps.length);

  return {
    serviceCount: records.length,
    averageGapDays,
    longestGapDays: longest.days,
    longestGapStartDate: longest.start,
    longestGapEndDate: longest.end,
  };
}

// Deliberately reads from computeMPGSeries rather than recomputing
// anything about which fill-ups are trustworthy - that judgement
// (missed fill-up detection, marked anomalies) already exists and is
// already tested; duplicating it here would risk the two disagreeing.
export function computeMpgTrend(fuelLogs: MpgCalcInput[]): MpgTrend {
  const series = computeMPGSeries(fuelLogs);
  const anomalyCount = series.filter((s) => s.likelyMissedFillUps).length;
  const valid = series.filter((s) => !s.likelyMissedFillUps);

  if (valid.length < 2) {
    return { hasEnoughData: false, overallAverageMpg: null, recentAverageMpg: null, recentSegmentCount: 0, anomalyCount };
  }

  const overallAverageMpg = valid.reduce((sum, s) => sum + s.mpg, 0) / valid.length;
  const recent = valid.slice(-RECENT_SEGMENT_COUNT);
  const recentAverageMpg = recent.reduce((sum, s) => sum + s.mpg, 0) / recent.length;

  return {
    hasEnoughData: true,
    overallAverageMpg,
    recentAverageMpg,
    recentSegmentCount: recent.length,
    anomalyCount,
  };
}

export function jobLabel(jobType: string): string {
  return JOB_LABELS[jobType] ?? jobType;
}
