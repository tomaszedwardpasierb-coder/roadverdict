// The free MOT check's pure parts: turning a VDG record into a MotRecord,
// guessing bike or car, explaining each defect, and the MOT score.
import { describe, expect, it } from "vitest";
import type { RawMotTest } from "@/lib/tracker/motHistory";
import { cleanRegistration, fromVdg, guessVehicleKind, normaliseDefectType, type MotRecord, type MotTest } from "@/lib/mot/motRecord";
import { categoryOf, costFor, explainDefect, severityOf } from "@/lib/mot/motDefects";
import { computeMotScore } from "@/lib/mot/motScore";

function raw(over: Partial<RawMotTest> = {}): RawMotTest {
  return {
    TestDate: "2025-03-01T10:00:00",
    TestPassed: true,
    ExpiryDate: "2026-03-01",
    OdometerReading: "12000",
    OdometerUnit: "MI",
    OdometerResultType: "READ",
    DaysOutOfMot: 0,
    IsRetest: false,
    AnnotationList: [],
    ...over,
  };
}

function record(tests: MotTest[], over: Partial<MotRecord> = {}): MotRecord {
  return { registration: "AB12CDE", make: "FORD", model: "FOCUS", fuelType: "PETROL", colour: "BLUE", motDueDate: "2027-03-01", tests, kind: "car", source: "vdg", ...over };
}

function test(date: string, passed: boolean, mileage: number | null, defects: MotTest["defects"] = []): MotTest {
  return { date, passed, mileage, expiryDate: null, defects };
}

const adv = (text: string) => ({ type: "ADVISORY" as const, text, dangerous: false });
const NOW = new Date("2026-10-09T12:00:00Z");

describe("fromVdg", () => {
  it("keeps every defect with its type, newest test first, and reads km as miles", () => {
    const r = fromVdg("AB12CDE", {
      Make: "HONDA",
      Model: "CBR600F",
      MotDueDate: "2026-05-01",
      MotTestDetailsList: [
        raw({ TestDate: "2024-05-01T09:00:00", OdometerReading: "16093", OdometerUnit: "KM", AnnotationList: [{ Type: "ADVISORY", Text: "Front tyre worn close to legal limit", IsDangerous: false }] }),
        raw({ TestDate: "2025-05-01T09:00:00", OdometerResultType: "UN-READABLE", AnnotationList: [{ Type: "MAJOR", Text: "Brake pipe corroded", IsDangerous: true }] }),
      ],
    });
    expect(r.tests.map((t) => t.date.slice(0, 4))).toEqual(["2025", "2024"]);
    expect(r.tests[0].mileage).toBeNull();
    expect(r.tests[0].defects[0]).toEqual({ type: "DANGEROUS", text: "Brake pipe corroded", dangerous: true });
    expect(r.tests[1].mileage).toBe(10000);
    expect(r.tests[1].defects[0].type).toBe("ADVISORY");
    expect(r.kind).toBe("bike");
  });

  it("puts a same-time pass before its fail", () => {
    const r = fromVdg("AB12CDE", { MotTestDetailsList: [raw({ TestPassed: true }), raw({ TestPassed: false })] });
    expect(r.tests.map((t) => t.passed)).toEqual([true, false]);
  });

  it("maps unknown defect types to OTHER", () => {
    expect(normaliseDefectType("user entered")).toBe("OTHER");
    expect(normaliseDefectType("prs")).toBe("PRS");
  });
});

describe("guessVehicleKind", () => {
  it("decides from a make only one list has", () => {
    expect(guessVehicleKind("TRIUMPH", "STREET TRIPLE")).toBe("bike");
    expect(guessVehicleKind("VAUXHALL", "CORSA")).toBe("car");
  });

  it("uses the model for makes that build both, and gives up on unknown makes", () => {
    expect(guessVehicleKind("HONDA", "CIVIC")).toBe("car");
    expect(guessVehicleKind("ZZZNOTAMAKE", "X")).toBeNull();
  });
});

describe("cleanRegistration", () => {
  it("accepts UK-style plates with or without spaces, and refuses anything else", () => {
    expect(cleanRegistration(" ab12 cde ")).toBe("AB12CDE");
    expect(cleanRegistration("AB12-CDE")).toBeNull();
    expect(cleanRegistration("A")).toBeNull();
    expect(cleanRegistration(undefined)).toBeNull();
  });
});

describe("defect explanations", () => {
  it("grades by type, with dangerous winning", () => {
    expect(severityOf({ type: "ADVISORY", dangerous: false })).toBe("advisory");
    expect(severityOf({ type: "MAJOR", dangerous: true })).toBe("dangerous");
    expect(severityOf({ type: "PRS", dangerous: false })).toBe("fixed");
  });

  it("sorts wording into categories, brake lamps under lights and leaking forks under suspension", () => {
    expect(categoryOf("Nearside Front Tyre worn close to legal limit")).toBe("tyres");
    expect(categoryOf("Brake lamp not working")).toBe("lights");
    expect(categoryOf("Front brake pad(s) less than 1.5 mm thick")).toBe("brakes");
    expect(categoryOf("Drive chain excessively slack")).toBe("chain");
    expect(categoryOf("Front fork seal leaking oil")).toBe("suspension");
    expect(categoryOf("Front fork seal leaking oil but not contaminating brakes")).toBe("suspension");
    expect(categoryOf("Brake pipe corroded")).toBe("brakes");
    expect(categoryOf("Something unusual")).toBe("other");
  });

  it("gives a typical cost only for jobs our price tables cover", () => {
    expect(costFor("brakes", "Front brake pad(s) worn", "car")?.line).toMatch(/^Typical cost: front brake pads £\d+-£\d+, depending on the car$/);
    expect(costFor("brakes", "Brake disc worn", "car")).toBeNull();
    expect(costFor("chain", "Drive chain slack", "bike")?.guideHref).toBe("/motorcycles/costs/chain-and-sprockets");
    expect(costFor("chain", "Drive chain slack", "car")).toBeNull();
    expect(costFor("tyres", "Tyre worn", null)).toBeNull();
    expect(explainDefect(adv("Offside rear tyre worn"), "bike").cost?.quoteHref).toContain("/quote-checker?job=");
  });
});

describe("computeMotScore", () => {
  it("has nothing to score without a test", () => {
    expect(computeMotScore(record([]), NOW)).toBeNull();
  });

  it("gives a clean record 100 and says why it's good", () => {
    const s = computeMotScore(record([test("2026-03-01", true, 30000), test("2025-03-01", true, 22000), test("2024-03-01", true, 14000)]), NOW)!;
    expect(s.score).toBe(100);
    expect(s.band).toBe("clean");
    expect(s.reasons.map((r) => r.text)).toEqual(["Passed first time at its last 3 MOTs", "Mileage only ever went up"]);
  });

  it("takes points off for a recent fail with no pass since, an expired MOT, and a dangerous defect", () => {
    const s = computeMotScore(
      record([test("2026-08-01", false, 40000, [{ type: "DANGEROUS", text: "Brake pipe corroded", dangerous: true }])], { motDueDate: "2026-08-01" }),
      NOW
    )!;
    expect(s.reasons.filter((r) => r.points < 0).map((r) => [r.text, r.points])).toEqual([
      ["Failed its most recent MOT, with no pass since", -25],
      ["No valid MOT today", -10],
      ["1 dangerous defect in the last 3 years", -10],
      ["Failed 1 MOT in the last 3 years", -5],
    ]);
    expect(s.score).toBe(50);
    expect(s.band).toBe("closer-look");
  });

  it("counts a fail and its same-day retest as one visit, and spots problems that keep coming back", () => {
    const s = computeMotScore(
      record([
        test("2026-03-01T14:00:00", true, 30000, [adv("Front tyre worn close to legal limit")]),
        test("2026-03-01T10:00:00", false, 30000, [{ type: "MAJOR", text: "Headlamp aim too high", dangerous: false }]),
        test("2025-03-01", true, 22000, [adv("Rear tyre worn close to legal limit")]),
        test("2024-03-01", true, 14000, [adv("Tyre slightly damaged")]),
      ]),
      NOW
    )!;
    const texts = s.reasons.map((r) => r.text);
    expect(texts).toContain("Failed 1 MOT in the last 3 years");
    expect(texts).toContain("Tyres noted at 3 MOTs in a row");
    expect(texts).toContain("1 advisory or minor defect at the latest MOT");
  });

  it("flags mileage that went down", () => {
    const s = computeMotScore(record([test("2026-03-01", true, 20000), test("2025-03-01", true, 25000)]), NOW)!;
    expect(s.reasons).toContainEqual({ text: "Recorded mileage went down between two tests - ask why", points: -15 });
    expect(s.reasons.map((r) => r.text)).not.toContain("Mileage only ever went up");
  });

  it("never goes below 0", () => {
    const many = Array.from({ length: 8 }, () => ({ type: "DANGEROUS" as const, text: "Brake failure", dangerous: true }));
    const s = computeMotScore(
      record([test("2026-08-01", false, 1000, [...many, adv("a"), adv("b"), adv("c"), adv("d"), adv("e"), adv("f")]), test("2025-08-01", false, 5000, many)], { motDueDate: "2026-08-01" }),
      NOW
    )!;
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.band).toBe("questions");
  });
});
