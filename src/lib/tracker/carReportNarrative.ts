// Place at: src/lib/tracker/carReportNarrative.ts
//
// Car equivalent of reportNarrative.ts - only the pieces that actually
// need car-specific wording or the car job catalog are mirrored here.
// generateStoryParagraphs and describeJobTypeGroup are reused directly
// from reportNarrative.ts (imported, not duplicated) - both are already
// fully vehicle-neutral (no "bike"/"motorcycle" wording, no job-catalog
// coupling), same "reuse when genuinely generic" precedent already set
// by computeMPGSeries/evidenceQuality.ts/backdateCheck.ts/mileageAudit.ts.
import { CAR_JOB_LABELS } from "./carJobTypes";
import type { JobTypeGroup } from "./reportNarrative";

export interface CarMileagePlausibilityCheck {
  implausible: boolean;
  reason?: string;
}

// Cars legitimately rack up far more lifetime mileage than motorcycles
// (daily/motorway use vs mostly leisure riding) - both thresholds here
// are deliberately higher than reportNarrative.ts's motorcycle-tuned
// ABSOLUTE_MILEAGE_CEILING/IMPLAUSIBLE_ANNUAL_RATE, not copied from them.
const ABSOLUTE_MILEAGE_CEILING = 400_000;
const IMPLAUSIBLE_ANNUAL_RATE = 60_000;

export function checkCurrentCarMileagePlausibility(
  currentMileage: number,
  car: { year?: number; isCustomBuild?: boolean }
): CarMileagePlausibilityCheck {
  if (currentMileage > ABSOLUTE_MILEAGE_CEILING) {
    return {
      implausible: true,
      reason: `The current mileage shown - ${currentMileage.toLocaleString()} miles - is not a realistic reading for a car. Until this is corrected, no mileage-based figure in this report can be relied on.`,
    };
  }
  if (car.year && !car.isCustomBuild) {
    const yearsOld = new Date().getFullYear() - car.year;
    if (yearsOld > 0) {
      const impliedAnnualRate = currentMileage / yearsOld;
      if (impliedAnnualRate > IMPLAUSIBLE_ANNUAL_RATE) {
        return {
          implausible: true,
          reason: `${currentMileage.toLocaleString()} miles over ${yearsOld} years works out to more than ${Math.round(impliedAnnualRate).toLocaleString()} miles a year, which isn't realistic for ordinary use - worth checking with the seller before relying on this figure.`,
        };
      }
    }
  }
  return { implausible: false };
}

export function groupCarServiceHistoryByJobType(
  records: { id: string; jobType: string; date: string; cost: number; hasReceipt: boolean }[]
): JobTypeGroup[] {
  const byType = new Map<string, typeof records>();
  for (const r of records) {
    if (!byType.has(r.jobType)) byType.set(r.jobType, []);
    byType.get(r.jobType)!.push(r);
  }

  const groups: JobTypeGroup[] = [];
  for (const [jobType, entries] of byType) {
    const seen = new Map<string, number>();
    for (const e of entries) {
      const key = `${e.date}::${e.cost}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const exactDuplicateCount = [...seen.values()].filter((c) => c > 1).reduce((sum, c) => sum + c, 0);
    const costs = entries.map((e) => e.cost);

    groups.push({
      jobType,
      label: CAR_JOB_LABELS[jobType] ?? jobType,
      count: entries.length,
      dates: entries.map((e) => e.date).sort(),
      minCost: Math.min(...costs),
      maxCost: Math.max(...costs),
      totalCost: costs.reduce((a, b) => a + b, 0),
      receiptCount: entries.filter((e) => e.hasReceipt).length,
      exactDuplicateCount,
    });
  }

  return groups.sort((a, b) => b.totalCost - a.totalCost);
}

export function generateCarSupportedAndUnconfirmed(
  groups: JobTypeGroup[],
  mileageCheck: CarMileagePlausibilityCheck,
  hasTyreEntries: boolean
): { supported: string[]; unconfirmed: string[] } {
  const supported: string[] = [];
  const unconfirmed: string[] = [];

  for (const g of groups) {
    if (g.count > 0 && g.receiptCount === g.count) {
      supported.push(`${g.label} has a receipt trail across ${g.count} ${g.count === 1 ? "entry" : "entries"}.`);
    } else if (g.receiptCount === 0) {
      unconfirmed.push(`${g.label} - no receipts attached for any of the ${g.count} logged ${g.count === 1 ? "entry" : "entries"}.`);
    }
  }

  if (mileageCheck.implausible) unconfirmed.push("The car's actual current mileage.");
  if (hasTyreEntries) unconfirmed.push("Tyre brand, model, or genuine remaining life - not currently captured by RoadVerdict's logging.");

  return { supported, unconfirmed };
}

// Extends the existing generic question set with ones grounded in the
// per-job-type findings above - "what did the £X entry actually
// include" only makes sense once there's a specific outlier to point at.
export function generateCarDetailedQuestions(groups: JobTypeGroup[], hasOtherEntries: boolean, hasTyreEntries: boolean): string[] {
  const questions: string[] = ["What's the car's actual current mileage - can I see the dash directly?"];

  const oilGroup = groups.find((g) => g.jobType === "oil-filter");
  if (oilGroup) questions.push("When was the oil last changed, and how many miles or months since the one before?");

  const cambeltGroup = groups.find((g) => g.jobType === "cambelt" || g.jobType === "timing-chain");
  if (!cambeltGroup) questions.push("When was the cambelt/timing chain last done, or has it never needed one?");

  if (hasTyreEntries) questions.push("What tyres are currently fitted - brand and model?");

  const receiptless = groups.filter((g) => g.receiptCount === 0);
  if (receiptless.length > 0) questions.push("Are there paper receipts for any of the work with none attached here, even if never uploaded?");

  const outlier = groups.find((g) => g.count > 1 && g.maxCost > g.minCost * 3);
  if (outlier) questions.push(`What did the £${outlier.maxCost.toFixed(2)} "${outlier.label}" entry actually include?`);

  if (hasOtherEntries) questions.push('What were the entries logged only as "Other"?');

  questions.push("Has this car had one owner throughout?");
  questions.push("Was any of this work done at an official dealer, or all independent?");
  questions.push("Would you consider the asking price against an independent pre-purchase inspection?");

  return questions;
}
