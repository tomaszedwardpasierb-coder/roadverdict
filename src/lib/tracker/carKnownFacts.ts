// Place at: src/lib/tracker/carKnownFacts.ts
//
// Car equivalent of knownFacts.ts - same consolidated, sourced summary,
// just car-shaped: engine size in litres (or a battery/fuel-type note
// for an EV) instead of engineCC, and CarDoc's own dvlaData shape.
import type { CarDoc } from "./car";
import type { fetchMotHistoryFromVdg } from "./motHistoryFetch";

export type CarFactSource = "RoadVerdict" | "DVLA" | "DVSA";

export interface CarKnownFact {
  label: string;
  value: string;
  source: CarFactSource;
}

function engineDescription(car: CarDoc): string {
  if (car.fuelType === "electric") {
    return car.batteryKwh ? `Electric, ${car.batteryKwh}kWh battery` : "Electric";
  }
  const litres = car.engineLitres ? `${car.engineLitres}L` : "Unknown size";
  return car.fuelType === "hybrid" || car.fuelType === "phev" ? `${litres} hybrid` : litres;
}

export function buildCarKnownFacts(
  car: CarDoc,
  currentRegistration: string | null,
  registrationChangesCount: number,
  totalEntries: number,
  receiptCount: number,
  motHistory: Awaited<ReturnType<typeof fetchMotHistoryFromVdg>>
): CarKnownFact[] {
  const facts: CarKnownFact[] = [];
  const vehicleSource: CarFactSource = car.isCustomBuild ? "RoadVerdict" : "DVLA";

  facts.push({
    label: "Make and model",
    value: `${car.make} ${car.model}`,
    source: vehicleSource,
  });
  facts.push({
    label: "Year",
    value: car.isCustomBuild ? "Custom build" : String(car.year ?? "Not recorded"),
    source: vehicleSource,
  });
  facts.push({
    label: "Engine",
    value: engineDescription(car),
    source: vehicleSource,
  });
  facts.push({
    label: "Current mileage",
    value: `${car.currentMileage.toLocaleString()} miles`,
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

  if (car.dvlaData) {
    const flags = [
      car.dvlaData.isScrapped ? "scrapped" : null,
      car.dvlaData.isExported ? "exported" : null,
      car.dvlaData.isUnscrapped ? "previously scrapped, later un-scrapped" : null,
    ].filter((f): f is string => f !== null);
    facts.push({
      label: "DVLA status",
      value: flags.length > 0 ? `Recorded as ${flags.join(", ")}` : "No scrapped, exported, or unscrapped flags",
      source: "DVLA",
    });
    facts.push({
      label: "Keeper changes on record",
      value: `${car.dvlaData.keeperChangeList.length}`,
      source: "DVLA",
    });
  }

  if (motHistory && motHistory.tests.length > 0) {
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
