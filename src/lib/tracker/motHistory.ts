// Place at: src/lib/tracker/motHistory.ts
//
// Pure parsing/shaping of Vehicle Data Global's MotHistoryDetails package
// into what this app actually needs - no Cosmos, no fetch, just data in,
// data out. Keeps the VDG response's PascalCase/string-typed fields
// isolated to this one file rather than leaking throughout the app.

export interface RawMotTest {
  TestDate: string;
  TestPassed: boolean;
  ExpiryDate: string | null;
  OdometerReading: string;
  OdometerUnit: string;
  OdometerResultType: string;
  DaysOutOfMot: number;
  IsRetest: boolean;
  AnnotationList: { Type: string; Text: string; IsDangerous: boolean }[];
}

export interface ParsedMotTest {
  testDate: string;
  passed: boolean;
  mileage: number | null;
  mileageTrusted: boolean;
  notes: string;
}

export interface ParsedMotHistory {
  motDueDate: string | null;
  tests: ParsedMotTest[];
}

function summarizeAnnotations(annotations: RawMotTest["AnnotationList"]): string {
  if (!annotations || annotations.length === 0) return "";
  return annotations.map((a) => `${a.IsDangerous ? "DANGEROUS: " : ""}${a.Type}: ${a.Text}`).join("; ");
}

// Same-day retest pairs (fail then pass, often an identical odometer
// reading) are one physical inspection told twice - confirmed real during
// testing, not hypothetical. Collapse to the test that actually decided
// the outcome, so the log doesn't show two entries with the same date.
function dedupeSameDayRetests(tests: RawMotTest[]): RawMotTest[] {
  const byDay = new Map<string, RawMotTest[]>();
  for (const t of tests) {
    const day = t.TestDate.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), t]);
  }
  const result: RawMotTest[] = [];
  for (const group of byDay.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    const latest = [...group].sort((a, b) => new Date(b.TestDate).getTime() - new Date(a.TestDate).getTime())[0];
    result.push(latest);
  }
  return result;
}

export function parseMotHistory(motDueDate: string | null, rawTests: RawMotTest[]): ParsedMotHistory {
  const deduped = dedupeSameDayRetests(rawTests ?? []);
  const tests: ParsedMotTest[] = deduped
    .map((t) => {
      // Only ever treat a confirmed DVSA reading as a real mileage anchor -
      // OdometerResultType can also be "UN-READABLE", meaning the figure
      // (if present at all) isn't trustworthy enough to feed into the
      // mileage-conflict system, even though it's still worth showing in
      // the log for completeness.
      const mileageTrusted = t.OdometerResultType === "READ";
      const rawReading = Number(t.OdometerReading);
      const mileage = mileageTrusted && Number.isFinite(rawReading) && rawReading > 0 ? Math.round(rawReading) : null;

      const parts = [t.TestPassed ? "Passed" : "Failed"];
      const annotationText = summarizeAnnotations(t.AnnotationList);
      if (annotationText) parts.push(annotationText);
      if (!mileageTrusted) parts.push("odometer reading not confirmed by DVSA - not used as a mileage anchor");

      return {
        testDate: t.TestDate,
        passed: t.TestPassed,
        mileage,
        mileageTrusted,
        notes: parts.join(" - "),
      };
    })
    .sort((a, b) => new Date(a.testDate).getTime() - new Date(b.testDate).getTime());

  return { motDueDate, tests };
}

export function motReminderDate(motDueDate: string): string {
  const d = new Date(motDueDate);
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
