// Place at: src/lib/mot/motScore.ts
//
// The RoadVerdict MOT score: one number out of 100 that sums up what a
// vehicle's MOT record shows, with every point it loses explained. It is
// a summary of the record, not a prediction of future bills - there's no
// data behind any claim like that, and the page says so. The rules are
// listed on the page too, so anyone can check a score by hand. Pure.
import { categoryOf, CATEGORIES, severityOf, type DefectCategory } from "./motDefects";
import type { MotRecord, MotTest } from "./motRecord";

export interface ScoreReason {
  text: string;
  // Negative: points taken off. 0: a good sign, shown but not scored.
  points: number;
}

export type ScoreBand = "clean" | "minor" | "closer-look" | "questions";

export const BAND_LABEL: Record<ScoreBand, string> = {
  clean: "Clean record",
  minor: "A few things to note",
  "closer-look": "Worth a closer look",
  questions: "Ask questions before buying",
};

export interface MotScore {
  score: number;
  band: ScoreBand;
  reasons: ScoreReason[];
}

// The rules, as shown on the page.
export const SCORE_RULES = [
  "Failed its most recent MOT with no pass since: -25",
  "No valid MOT today: -10",
  "Each dangerous defect in the last 3 years: -10 (up to -30)",
  "Each failed test in the last 3 years: -5 (up to -15)",
  "The same kind of problem noted at consecutive MOTs, up to the latest: -5 each (up to -15)",
  "Each advisory or minor defect at the latest MOT: -2 (up to -10)",
  "Recorded mileage that went down between tests: -15",
] as const;

const DAY = 24 * 60 * 60 * 1000;
const THREE_YEARS = 3 * 365.25 * DAY;

// A fail and its same-day retest are one visit to the test centre.
function visits(tests: MotTest[]): MotTest[][] {
  const byDay = new Map<string, MotTest[]>();
  for (const t of tests) {
    const day = t.date.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), t]);
  }
  return [...byDay.values()]; // newest first, since tests are
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function bandOf(score: number): ScoreBand {
  if (score >= 85) return "clean";
  if (score >= 70) return "minor";
  if (score >= 50) return "closer-look";
  return "questions";
}

export function computeMotScore(record: MotRecord, now = new Date()): MotScore | null {
  const tests = record.tests;
  if (tests.length === 0) return null;
  const reasons: ScoreReason[] = [];
  const recent = (t: MotTest) => now.getTime() - new Date(t.date).getTime() <= THREE_YEARS;
  const byVisit = visits(tests);

  if (!tests[0].passed) reasons.push({ text: "Failed its most recent MOT, with no pass since", points: -25 });

  if (record.motDueDate && new Date(record.motDueDate).getTime() < now.getTime()) {
    reasons.push({ text: "No valid MOT today", points: -10 });
  }

  const dangerous = tests.filter(recent).flatMap((t) => t.defects).filter((d) => severityOf(d) === "dangerous").length;
  if (dangerous > 0) {
    reasons.push({ text: `${plural(dangerous, "dangerous defect")} in the last 3 years`, points: -Math.min(30, dangerous * 10) });
  }

  const failedVisits = byVisit.filter((v) => v.some(recent) && v.some((t) => !t.passed)).length;
  if (failedVisits > 0) {
    reasons.push({ text: `Failed ${plural(failedVisits, "MOT")} in the last 3 years`, points: -Math.min(15, failedVisits * 5) });
  }

  // Problems that keep coming back: a category noted at the latest visit
  // and at the visit(s) straight before it.
  const categoriesAt = (v: MotTest[]): Set<DefectCategory> =>
    new Set<DefectCategory>(
      v
        .flatMap((t) => t.defects)
        .filter((d) => ["advisory", "minor", "failed", "dangerous"].includes(severityOf(d)))
        .map((d) => categoryOf(d.text))
        .filter((c) => c !== "other")
    );
  const streaks: { category: DefectCategory; length: number }[] = [];
  const latest = byVisit.length > 0 ? categoriesAt(byVisit[0]) : new Set<DefectCategory>();
  for (const category of latest) {
    let length = 1;
    while (length < byVisit.length && categoriesAt(byVisit[length]).has(category)) length++;
    if (length >= 2) streaks.push({ category, length });
  }
  streaks.sort((a, b) => b.length - a.length);
  streaks.forEach((s, i) => {
    reasons.push({
      text: `${CATEGORIES[s.category].name} noted at ${s.length} MOTs in a row`,
      points: i < 3 ? -5 : 0,
    });
  });

  const openItems = byVisit[0]
    .flatMap((t) => t.defects)
    .filter((d) => ["advisory", "minor"].includes(severityOf(d))).length;
  if (openItems > 0) {
    reasons.push({ text: `${plural(openItems, "advisory or minor defect", "advisories or minor defects")} at the latest MOT`, points: -Math.min(10, openItems * 2) });
  }

  const readings = [...tests].reverse().filter((t) => t.mileage !== null) as (MotTest & { mileage: number })[];
  const wentDown = readings.some((t, i) => i > 0 && t.mileage < readings[i - 1].mileage);
  if (wentDown) reasons.push({ text: "Recorded mileage went down between two tests - ask why", points: -15 });

  // Good signs, shown without points.
  let firstTimePasses = 0;
  for (const v of byVisit) {
    if (v.every((t) => t.passed)) firstTimePasses++;
    else break;
  }
  if (firstTimePasses >= 2) reasons.push({ text: `Passed first time at its last ${firstTimePasses} MOTs`, points: 0 });
  if (!wentDown && readings.length >= 2) reasons.push({ text: "Mileage only ever went up", points: 0 });

  const score = Math.max(0, Math.min(100, 100 + reasons.reduce((sum, r) => sum + r.points, 0)));
  return { score, band: bandOf(score), reasons };
}
