// Place at: src/lib/tracker/knownFacts.ts
//
// A single, consolidated summary of what's known about this bike and
// exactly where each fact comes from - RoadVerdict (self-reported by
// whoever's logged it), DVLA, or DVSA. This deliberately doesn't
// replace the detailed MOT history, ownership history, or item-by-item
// sections further down the report - those remain the full evidence
// this summary points to, not something this duplicates.
//
// Takes motHistory as a plain argument rather than fetching it itself,
// since that fetch already lives in detailed/page.tsx - this stays a
// pure function of data the caller already has, not a second place
// that reaches out to the MOT API.
import type { BikeDoc } from "./bike";
import type { fetchMotHistoryFromVdg } from "./motHistoryFetch";

export type FactSource = "RoadVerdict" | "DVLA" | "DVSA";

export interface KnownFact {
  label: string;
  value: string;
  source: FactSource;
}

export function buildKnownFacts(
  bike: BikeDoc,
  currentRegistration: string | null,
  registrationChangesCount: number,
  totalEntries: number,
  receiptCount: number,
  motHistory: Awaited<ReturnType<typeof fetchMotHistoryFromVdg>>
): KnownFact[] {
  const facts: KnownFact[] = [];
  // A custom build has no real DVLA vehicle record behind it - these
  // fields are whatever the owner entered by hand, not a lookup.
  const vehicleSource: FactSource = bike.isCustomBuild ? "RoadVerdict" : "DVLA";

  facts.push({
    label: "Make and model",
    value: `${bike.make} ${bike.model}`,
    source: vehicleSource,
  });
  facts.push({
    label: "Year",
    value: bike.isCustomBuild ? "Custom build" : String(bike.year ?? "Not recorded"),
    source: vehicleSource,
  });
  facts.push({
    label: "Engine size",
    value: `${bike.engineCC}cc`,
    source: vehicleSource,
  });
  facts.push({
    label: "Current mileage",
    value: `${bike.currentMileage.toLocaleString()} miles`,
    source: "RoadVerdict",
  });

  if (currentRegistration) {
    facts.push({
      label: "Registration",
      value: currentRegistration,
      source: "DVLA",
    });
  }
  if (registrationChangesCount > 0) {
    facts.push({
      label: "Registration changes on this account",
      value: `${registrationChangesCount}`,
      source: "RoadVerdict",
    });
  }

  if (bike.dvlaData) {
    const flags = [
      bike.dvlaData.isScrapped ? "scrapped" : null,
      bike.dvlaData.isExported ? "exported" : null,
      bike.dvlaData.isUnscrapped ? "previously scrapped, later un-scrapped" : null,
    ].filter((f): f is string => f !== null);
    facts.push({
      label: "DVLA status",
      value: flags.length > 0 ? `Recorded as ${flags.join(", ")}` : "No scrapped, exported, or unscrapped flags",
      source: "DVLA",
    });
    facts.push({
      label: "Keeper changes on record",
      value: `${bike.dvlaData.keeperChangeList.length}`,
      source: "DVLA",
    });
  }

  if (motHistory && motHistory.tests.length > 0) {
    // Tests are stored oldest-first - see the .slice().reverse() used
    // elsewhere in detailed/page.tsx to display them newest-first, so
    // the last element here is genuinely the most recent test.
    const mostRecent = motHistory.tests[motHistory.tests.length - 1];
    facts.push({
      label: "MOT history",
      value: `${motHistory.tests.length} test${motHistory.tests.length === 1 ? "" : "s"} on record, most recent ${mostRecent.passed ? "passed" : "failed"}${motHistory.motDueDate ? `, next due ${motHistory.motDueDate}` : ""}`,
      source: "DVSA",
    });
  }

  facts.push({
    label: "Logged history",
    value: `${totalEntries} entr${totalEntries === 1 ? "y" : "ies"} logged (${receiptCount} with a receipt attached)`,
    source: "RoadVerdict",
  });

  return facts;
}