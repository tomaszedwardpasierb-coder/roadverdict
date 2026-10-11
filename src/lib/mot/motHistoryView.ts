// Place at: src/lib/mot/motHistoryView.ts
//
// An MOT record turned into what the app's MOT history screen shows: the
// MOT status line, the RoadVerdict MOT score with its reasons, and every
// test with each defect explained (and costed where our price tables
// cover it). The same wording as the website's free MOT check
// (app/mot-check/MotCheckResult.tsx), worked out here so the app only
// renders it. Pure - no fetch, no Cosmos.
import { explainDefect, SEVERITY, CATEGORIES, type DefectSeverity } from "@/lib/mot/motDefects";
import { computeMotScore, BAND_LABEL, type ScoreBand, type ScoreReason } from "@/lib/mot/motScore";
import type { MotRecord } from "@/lib/mot/motRecord";

export interface MotHistoryDefectView {
  text: string;
  severity: DefectSeverity;
  severityLabel: string;
  categoryName: string;
  explanation: string;
  cost: { line: string; guideUrl: string; quoteUrl: string } | null;
}

export interface MotHistoryTestView {
  date: string;
  dateLabel: string;
  passed: boolean;
  mileage: number | null;
  defects: MotHistoryDefectView[];
}

export interface MotHistoryView {
  registration: string;
  status: { tone: "ok" | "bad" | "unknown"; text: string };
  score: { value: number; band: ScoreBand; label: string; reasons: ScoreReason[] } | null;
  tests: MotHistoryTestView[];
  disclaimer: string;
}

export const MOT_SOURCE_NOTE =
  "MOT records come from DVSA. Contains public sector information licensed under the Open Government Licence v3.0. The explanations and score are general guidance, not a mechanical inspection.";

function ukDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(new Date(iso));
}

function statusOf(record: MotRecord, now: Date): MotHistoryView["status"] {
  if (!record.motDueDate) return { tone: "unknown", text: "MOT status not available" };
  const due = new Date(record.motDueDate);
  if (record.tests.length === 0) return { tone: "ok", text: `No MOT yet - the first is due by ${ukDate(record.motDueDate)}` };
  return due.getTime() >= now.getTime()
    ? { tone: "ok", text: `MOT valid until ${ukDate(record.motDueDate)}` }
    : { tone: "bad", text: `MOT expired on ${ukDate(record.motDueDate)}` };
}

export function toMotHistoryView(record: MotRecord, appUrl: string, now = new Date()): MotHistoryView {
  const score = computeMotScore(record, now);
  return {
    registration: record.registration,
    status: statusOf(record, now),
    score: score ? { value: score.score, band: score.band, label: BAND_LABEL[score.band], reasons: score.reasons } : null,
    tests: record.tests.map((t) => ({
      date: t.date,
      dateLabel: ukDate(t.date),
      passed: t.passed,
      mileage: t.mileage,
      defects: t.defects.map((d) => {
        const e = explainDefect(d, record.kind);
        return {
          text: e.text,
          severity: e.severity,
          severityLabel: SEVERITY[e.severity].label,
          categoryName: CATEGORIES[e.category].name,
          explanation: CATEGORIES[e.category].explain,
          cost: e.cost ? { line: e.cost.line, guideUrl: `${appUrl}${e.cost.guideHref}`, quoteUrl: `${appUrl}${e.cost.quoteHref}` } : null,
        };
      }),
    })),
    disclaimer: MOT_SOURCE_NOTE,
  };
}
