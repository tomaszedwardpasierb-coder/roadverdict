// Place at: src/lib/tracker/reportNarrative.ts
//
// Reports on the record, never on the person. Every function here
// either counts/groups/compares real logged data, or turns that count
// into a plain sentence stating the fact - nothing infers intent,
// character, or why a pattern exists. "20 entries were logged on one
// day" is something this file can say; "the seller assembled this
// history in one sitting before selling" is a judgement about a person
// this file deliberately never makes, even though a reader is free to
// draw that conclusion themselves from the fact alone.

import { JOB_LABELS } from "./jobTypes";

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export interface MileagePlausibilityCheck {
  implausible: boolean;
  reason?: string;
}

// No real motorcycle in ordinary road use exceeds this - deliberately
// generous so it only catches genuine data errors, not high-mileage
// touring bikes.
const ABSOLUTE_MILEAGE_CEILING = 250_000;
const IMPLAUSIBLE_ANNUAL_RATE = 40_000;

export function checkCurrentMileagePlausibility(
  currentMileage: number,
  bike: { year?: number; isCustomBuild?: boolean }
): MileagePlausibilityCheck {
  if (currentMileage > ABSOLUTE_MILEAGE_CEILING) {
    return {
      implausible: true,
      reason: `The current mileage shown - ${currentMileage.toLocaleString()} miles - is not a realistic reading for a motorcycle. Until this is corrected, no mileage-based figure in this report can be relied on.`,
    };
  }
  if (bike.year && !bike.isCustomBuild) {
    const yearsOld = new Date().getFullYear() - bike.year;
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

export interface JobTypeGroup {
  jobType: string;
  label: string;
  count: number;
  dates: string[];
  minCost: number;
  maxCost: number;
  totalCost: number;
  receiptCount: number;
  exactDuplicateCount: number; // entries sharing the same date AND cost as another entry in this group
}

export function groupServiceHistoryByJobType(
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
      label: JOB_LABELS[jobType] ?? jobType,
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

export interface StoryMetrics {
  totalEntries: number;
  totalSpend: number;
  backdatedCount: number;
  receiptCount: number;
  largestClusterCount: number;
  largestClusterDate: string | null;
  totalExactDuplicates: number;
  otherCount: number;
  otherMinCost: number;
  otherMaxCost: number;
}

export function generateStoryParagraphs(m: StoryMetrics): string[] {
  const paragraphs: string[] = [];

  const backdatePct = m.totalEntries > 0 ? Math.round((m.backdatedCount / m.totalEntries) * 100) : 0;
  let opening = `${m.totalEntries} entries, £${m.totalSpend.toFixed(2)} logged.`;
  if (m.backdatedCount > 0) {
    opening += ` ${m.backdatedCount} of those entries - ${backdatePct}% - were added to RoadVerdict after the date they claim to record`;
    if (m.largestClusterCount >= 5 && m.largestClusterDate) {
      opening += `, with the largest single concentration being ${m.largestClusterCount} entries logged on ${fmtDate(m.largestClusterDate)} alone`;
    }
    opening += ".";
  } else {
    opening += " Entries were logged close to when the work was claimed to happen.";
  }
  paragraphs.push(opening);

  if (m.totalExactDuplicates > 0) {
    paragraphs.push(
      `At least ${m.totalExactDuplicates} entries share an identical date and cost with another entry of the same type - the same charge appears to have been logged more than once.`
    );
  }

  const receiptPct = m.totalEntries > 0 ? Math.round((m.receiptCount / m.totalEntries) * 100) : 0;
  paragraphs.push(`${m.receiptCount} of ${m.totalEntries} entries - ${receiptPct}% - have a receipt or invoice attached.`);

  if (m.otherCount > 0) {
    paragraphs.push(
      `${m.otherCount} ${m.otherCount === 1 ? "entry is" : "entries are"} logged only as "Other", ranging from £${m.otherMinCost.toFixed(2)} to £${m.otherMaxCost.toFixed(2)} - a range wide enough to hide real detail about what that spend was actually on.`
    );
  }

  return paragraphs;
}

export function describeJobTypeGroup(g: JobTypeGroup): string {
  const parts: string[] = [`${g.count} ${g.count === 1 ? "entry" : "entries"} (${g.dates.map(fmtDate).join(", ")})`];

  if (g.exactDuplicateCount > 0) {
    parts.push("including entries that repeat with an identical date and cost");
  }
  if (g.receiptCount === 0) {
    parts.push("none with a receipt attached");
  } else if (g.receiptCount < g.count) {
    parts.push(`${g.receiptCount} of ${g.count} with a receipt attached`);
  } else {
    parts.push("all with a receipt attached");
  }
  if (g.count > 1 && g.maxCost > g.minCost * 2) {
    parts.push(`cost ranging from £${g.minCost.toFixed(2)} to £${g.maxCost.toFixed(2)}`);
  }

  return parts.join(" - ") + ".";
}

export function generateSupportedAndUnconfirmed(
  groups: JobTypeGroup[],
  mileageCheck: MileagePlausibilityCheck,
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

  if (mileageCheck.implausible) unconfirmed.push("The bike's actual current mileage.");
  if (hasTyreEntries) unconfirmed.push("Tyre brand, model, or genuine remaining life - not currently captured by RoadVerdict's logging.");

  return { supported, unconfirmed };
}

// Extends the existing generic question set with ones grounded in the
// per-job-type findings above - "what did the £X entry actually
// include" only makes sense once there's a specific outlier to point at.
export function generateDetailedQuestions(groups: JobTypeGroup[], hasOtherEntries: boolean, hasTyreEntries: boolean): string[] {
  const questions: string[] = ["What's the bike's actual current mileage - can I see the dash directly?"];

  const oilGroup = groups.find((g) => g.jobType === "oil-filter");
  if (oilGroup) questions.push("When was the oil last changed, and how many miles or months since the one before?");

  if (hasTyreEntries) questions.push("What tyres are currently fitted - brand and model?");

  const receiptless = groups.filter((g) => g.receiptCount === 0);
  if (receiptless.length > 0) questions.push("Are there paper receipts for any of the work with none attached here, even if never uploaded?");

  const outlier = groups.find((g) => g.count > 1 && g.maxCost > g.minCost * 3);
  if (outlier) questions.push(`What did the £${outlier.maxCost.toFixed(2)} "${outlier.label}" entry actually include?`);

  if (hasOtherEntries) questions.push('What were the entries logged only as "Other"?');

  questions.push("Has this bike had one owner throughout?");
  questions.push("Was any of this work done at an official dealer, or all independent?");
  questions.push("Would you consider the asking price against an independent pre-purchase inspection?");

  return questions;
}
