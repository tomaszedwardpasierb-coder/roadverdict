// Place at: src/lib/mot/motRecord.ts
//
// One shape for a vehicle's MOT record, whichever service it came from.
// The free MOT check (/mot-check) reads only this, so moving from Vehicle
// Data Global to DVSA's own free MOT History API is a new adapter beside
// fromVdg() below, not a change to the page. Pure: no fetch, no Cosmos.
//
// Unlike parseMotHistory() (motHistory.ts), which flattens each test's
// defects into one notes string for the logbook, this keeps every defect
// separate with its type, because the check page explains each one.
import type { RawMotTest } from "@/lib/tracker/motHistory";
import { ALL_BRANDS, MOTORCYCLE_MODELS } from "@/lib/motorcycleModels";
import { ALL_CAR_BRANDS } from "@/lib/carModels";

const KM_TO_MILES = 0.621371;

// DVSA's own defect types. VDG passes them through as they are.
export type MotDefectType = "DANGEROUS" | "MAJOR" | "FAIL" | "MINOR" | "ADVISORY" | "PRS" | "OTHER";

export interface MotDefect {
  type: MotDefectType;
  text: string;
  dangerous: boolean;
}

export interface MotTest {
  // ISO date-time of the test.
  date: string;
  passed: boolean;
  // In miles. null when DVSA didn't record a readable figure.
  mileage: number | null;
  expiryDate: string | null;
  defects: MotDefect[];
}

export type MotVehicleKind = "bike" | "car";

export interface MotRecord {
  registration: string;
  make: string;
  model: string;
  fuelType: string;
  colour: string;
  // When the current MOT runs out (or the first one is due, for a vehicle
  // too new to have had one). null when the source doesn't say.
  motDueDate: string | null;
  // Newest first.
  tests: MotTest[];
  // A best guess from the make and model - neither source states it.
  kind: MotVehicleKind | null;
  source: "vdg" | "dvsa";
}

const KNOWN_TYPES: MotDefectType[] = ["DANGEROUS", "MAJOR", "FAIL", "MINOR", "ADVISORY", "PRS"];

export function normaliseDefectType(raw: string): MotDefectType {
  const t = (raw ?? "").trim().toUpperCase();
  return (KNOWN_TYPES as string[]).includes(t) ? (t as MotDefectType) : "OTHER";
}

function readMiles(reading: string, unit: string, resultType: string): number | null {
  if (resultType !== "READ") return null;
  const n = Number(reading);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(/kilomet|km/i.test(unit ?? "") ? n * KM_TO_MILES : n);
}

// A failed test and its same-day retest are two separate records in the
// source data; both stay, newest first, so the page shows the fail and the
// pass that followed it.
export function fromVdg(
  registration: string,
  details: { Make?: string; Model?: string; FuelType?: string; Colour?: string; MotDueDate?: string | null; MotTestDetailsList?: RawMotTest[] }
): MotRecord {
  const tests: MotTest[] = (details.MotTestDetailsList ?? [])
    .map((t) => ({
      date: t.TestDate,
      passed: t.TestPassed,
      mileage: readMiles(t.OdometerReading, t.OdometerUnit, t.OdometerResultType),
      expiryDate: t.ExpiryDate ?? null,
      defects: (t.AnnotationList ?? []).map((a) => ({
        type: a.IsDangerous ? "DANGEROUS" : normaliseDefectType(a.Type),
        text: (a.Text ?? "").trim(),
        dangerous: Boolean(a.IsDangerous),
      })),
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || Number(b.passed) - Number(a.passed));
  const make = details.Make ?? "";
  const model = details.Model ?? "";
  return {
    registration,
    make,
    model,
    fuelType: details.FuelType ?? "",
    colour: details.Colour ?? "",
    motDueDate: details.MotDueDate ?? null,
    tests,
    kind: guessVehicleKind(make, model),
    source: "vdg",
  };
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const BIKE_MAKES = new Set(ALL_BRANDS.map(norm));
const CAR_MAKES = new Set(ALL_CAR_BRANDS.map(norm));

// Makes only one list knows decide it outright. For makes on both (Honda,
// BMW, Suzuki...), a model found in the motorcycle list means a bike, and
// anything else is taken to be a car. null when the make is on neither
// list - the page then lets the visitor say which it is.
export function guessVehicleKind(make: string, model: string): MotVehicleKind | null {
  const m = norm(make);
  if (!m) return null;
  const onBike = BIKE_MAKES.has(m);
  const onCar = CAR_MAKES.has(m);
  if (onBike && !onCar) return "bike";
  if (onCar && !onBike) return "car";
  if (!onBike && !onCar) return null;
  const target = norm(model);
  if (!target) return null;
  const bikeModels = MOTORCYCLE_MODELS.filter((b) => norm(b.make) === m).map((b) => norm(b.model)).filter((x) => x.length >= 3);
  return bikeModels.some((b) => target.includes(b) || b.includes(target)) ? "bike" : "car";
}

// Spaces out, capitals, letters and digits only. null for anything that
// can't be a UK registration.
export function cleanRegistration(input: string | null | undefined): string | null {
  const v = (input ?? "").toUpperCase().replace(/\s+/g, "");
  return /^[A-Z0-9]{2,8}$/.test(v) ? v : null;
}
