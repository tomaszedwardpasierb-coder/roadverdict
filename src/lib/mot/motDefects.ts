// Place at: src/lib/mot/motDefects.ts
//
// Plain-English meaning for each MOT defect on the free MOT check page:
// how serious its grade is, what the part does, and - only where our
// sourced price tables cover the job - what fixing it typically costs.
// Written by hand rather than by an AI, because the same few hundred
// DVSA defect wordings repeat across every vehicle and these explanations
// have to be right every time. Pure: no fetch, no Cosmos.
import { findPriceGuide, overallRange, priceGuidePath, quoteCheckerHref, formatPounds, type BenchmarkGuide } from "@/lib/seo/priceGuides";
import type { MotDefect, MotDefectType, MotVehicleKind } from "./motRecord";

export type DefectSeverity = "dangerous" | "failed" | "minor" | "advisory" | "fixed" | "note";

export const SEVERITY: Record<DefectSeverity, { label: string; meaning: string }> = {
  dangerous: {
    label: "Dangerous",
    meaning: "The tester judged this a direct risk to road safety. The vehicle failed, and it shouldn’t be driven until this is fixed.",
  },
  failed: {
    label: "Failed",
    meaning: "Serious enough to fail the test. It had to be fixed before the vehicle could pass.",
  },
  minor: {
    label: "Minor",
    meaning: "Didn’t fail the test, but the tester recorded a defect that should be fixed soon.",
  },
  advisory: {
    label: "Advisory",
    meaning: "Not a fail. Something the tester noticed that may need work before the next MOT - worth keeping an eye on.",
  },
  fixed: {
    label: "Fixed at the test",
    meaning: "It failed on this, then it was repaired at the test centre within an hour and passed.",
  },
  note: {
    label: "Note",
    meaning: "A comment recorded by the tester.",
  },
};

export function severityOf(defect: Pick<MotDefect, "type" | "dangerous">): DefectSeverity {
  if (defect.dangerous || defect.type === "DANGEROUS") return "dangerous";
  const byType: Record<MotDefectType, DefectSeverity> = {
    DANGEROUS: "dangerous",
    MAJOR: "failed",
    FAIL: "failed",
    MINOR: "minor",
    ADVISORY: "advisory",
    PRS: "fixed",
    OTHER: "note",
  };
  return byType[defect.type];
}

export type DefectCategory =
  | "tyres"
  | "lights"
  | "brakes"
  | "chain"
  | "suspension"
  | "steering"
  | "exhaust"
  | "leak"
  | "corrosion"
  | "windscreen"
  | "wheels"
  | "seatbelts"
  | "body"
  | "other";

interface CategoryInfo {
  name: string;
  explain: string;
  // A price guide slug per vehicle, only where the defect wording itself
  // says it's that job (see costFor below).
  guide?: Partial<Record<MotVehicleKind, string>>;
}

export const CATEGORIES: Record<DefectCategory, CategoryInfo> = {
  tyres: {
    name: "Tyres",
    explain:
      "Usually tread wearing down towards the legal limit (1.6mm for a car, 1mm for most motorcycles), cracking from age, or damage to the sidewall. Tyres wear gradually, so a tyre advisory often becomes a fail by the next MOT.",
    guide: { car: "tyres", bike: "tyres" },
  },
  lights: {
    name: "Lights",
    explain:
      "A bulb, lens, headlamp aim or indicator problem. Most are cheap to fix - often just a bulb - but a light that doesn’t work is a fail.",
  },
  brakes: {
    name: "Brakes",
    explain:
      "Brake pads or discs wearing, brake pipes or hoses deteriorating, or the brakes pulling or not working evenly. Worth having looked at sooner rather than later.",
    guide: { car: "brake-pads", bike: "brake-pads" },
  },
  chain: {
    name: "Chain and sprockets",
    explain:
      "On a motorcycle, the drive chain and sprockets wear together and are usually replaced as a set. A chain that’s slack, stiff or worn is a common advisory.",
    guide: { bike: "chain-and-sprockets" },
  },
  suspension: {
    name: "Suspension",
    explain:
      "Shock absorbers, springs, bushes or joints wearing or leaking - on a motorcycle often a fork seal. Worn suspension affects handling and braking, and tends to get worse over time.",
  },
  steering: {
    name: "Steering",
    explain:
      "Wear or play in the steering parts, such as track rod ends or steering joints, or on a motorcycle the head bearings. Steering faults are taken seriously at the MOT.",
  },
  exhaust: {
    name: "Exhaust and emissions",
    explain:
      "An exhaust leak or loose mounting, or emissions over the limit. A blowing exhaust can often be repaired; emissions problems can point to an engine or sensor issue.",
  },
  leak: {
    name: "Leak",
    explain:
      "Oil or another fluid leaking. A small weep is common on older vehicles, but it’s worth finding where it comes from before it gets worse.",
  },
  corrosion: {
    name: "Corrosion",
    explain:
      "Rust on the body, chassis or underside. Surface corrosion is common; corrosion that weakens the structure or sits near brake or suspension mounting points is the kind that becomes a fail.",
  },
  windscreen: {
    name: "Windscreen and wipers",
    explain:
      "A chip or crack in the windscreen, or worn wipers or washers. Damage in the driver’s line of sight is judged most strictly.",
  },
  wheels: {
    name: "Wheels and bearings",
    explain:
      "A wheel bearing that’s rough or has play, or damage to a wheel. A worn bearing usually gets noisier before it fails.",
  },
  seatbelts: {
    name: "Seat belts and airbags",
    explain: "A seat belt that’s damaged or doesn’t latch properly, or an airbag warning. These are safety items that need fixing.",
  },
  body: {
    name: "Body and structure",
    explain: "Damage to panels, sharp edges, a loose bumper or a fixing that’s come loose.",
  },
  other: {
    name: "Other",
    explain: "A defect the tester recorded. The official wording above says what was found.",
  },
};

// Order matters: a "brake lamp" is a light, a corroded brake pipe is a
// brake defect, and a fork seal "leaking oil but not contaminating
// brakes" is suspension.
const RULES: [DefectCategory, RegExp][] = [
  ["tyres", /\btyres?\b/i],
  ["lights", /\b(lamps?|headlamps?|lights?|indicators?|reflectors?|bulbs?)\b/i],
  ["chain", /\b(drive chain|chain|sprockets?)\b/i],
  ["steering", /\b(steering|track rod|rack|head bearings?)\b/i],
  ["suspension", /\b(suspension|shock absorbers?|springs?|ball joints?|bush(es)?|wishbones?|forks?|fork seals?|swinging arm|anti-roll|stabiliser|coil)\b/i],
  ["brakes", /\b(brakes?|braking|brake pads?|pads?|discs?|calipers?|abs)\b/i],
  ["exhaust", /\b(exhaust|emissions?|smoke|catalytic|silencer|lambda|particulate|dpf)\b/i],
  ["leak", /\b(leak|leaking|leaks)\b/i],
  ["corrosion", /\b(corroded|corrosion|rust|rusted)\b/i],
  ["windscreen", /\b(windscreen|wipers?|washers?)\b/i],
  ["wheels", /\b(wheel bearings?|wheels?|hub)\b/i],
  ["seatbelts", /\b(seat ?belts?|airbags?|srs)\b/i],
  ["body", /\b(body|bumper|panel|sharp edge|door|bonnet|boot)\b/i],
];

export function categoryOf(text: string): DefectCategory {
  return RULES.find(([, re]) => re.test(text))?.[0] ?? "other";
}

export interface DefectCost {
  // e.g. "Typical cost: front brake pads £60-£180, depending on the car"
  line: string;
  guideHref: string;
  quoteHref: string;
}

// Only when the wording names the job our price tables cover: "pads" for
// brake pads (not a disc or a pipe), "chain" or "sprocket" for chain and
// sprockets, any tyre defect for tyres. The range spans every size of
// vehicle, since the MOT record doesn't say which size this one is.
export function costFor(category: DefectCategory, text: string, kind: MotVehicleKind | null): DefectCost | null {
  if (!kind) return null;
  const slug = CATEGORIES[category].guide?.[kind];
  if (!slug) return null;
  if (category === "brakes" && !/\bpads?\b/i.test(text)) return null;
  const guide = findPriceGuide(kind === "bike" ? "motorcycle" : "car", slug);
  if (!guide || guide.kind !== "benchmark") return null;
  const { low, high } = overallRange(guide);
  return {
    line: `Typical cost: ${guide.name.toLowerCase()} ${formatPounds(low)}-${formatPounds(high)}, depending on the ${kind === "bike" ? "motorcycle" : "car"}`,
    guideHref: priceGuidePath(guide),
    quoteHref: quoteCheckerHref(guide as BenchmarkGuide),
  };
}

export interface ExplainedDefect extends MotDefect {
  severity: DefectSeverity;
  category: DefectCategory;
  cost: DefectCost | null;
}

export function explainDefect(defect: MotDefect, kind: MotVehicleKind | null): ExplainedDefect {
  const category = categoryOf(defect.text);
  return { ...defect, severity: severityOf(defect), category, cost: costFor(category, defect.text, kind) };
}
