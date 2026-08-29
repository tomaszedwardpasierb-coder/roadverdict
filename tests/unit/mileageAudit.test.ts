import { describe, expect, it } from "vitest";
import { findMileageMonotonicityViolations, findImplausibleFuelFills } from "@/lib/tracker/mileageAudit";

describe("findMileageMonotonicityViolations", () => {
  it("returns nothing for an empty list", () => {
    expect(findMileageMonotonicityViolations([])).toEqual([]);
  });

  // Only records carrying mileageConfidence are ever candidates for
  // flagging at all - a human-typed figure is the rider's own, not
  // something this tool second-guesses, even if it looks inconsistent.
  it("never flags a record with no mileageConfidence, however inconsistent it looks", () => {
    const records = [
      { id: "r1", date: "2025-01-01", mileage: 5000 },
      { id: "r2", date: "2025-02-01", mileage: 4000 }, // genuinely lower than before
    ];
    expect(findMileageMonotonicityViolations(records)).toEqual([]);
  });

  it("flags an AI-derived record that's lower than the chronologically earlier one", () => {
    const records = [
      { id: "r1", date: "2025-01-01", mileage: 5000 }, // no confidence - can never be flagged itself, purely a reference point
      { id: "r2", date: "2025-02-01", mileage: 4000, mileageConfidence: "estimated" as const },
    ];
    expect(findMileageMonotonicityViolations(records)).toEqual(["r2"]);
  });

  it("flags an AI-derived record that's higher than the chronologically later one", () => {
    const records = [
      { id: "r1", date: "2025-01-01", mileage: 6000, mileageConfidence: "estimated" as const },
      { id: "r2", date: "2025-02-01", mileage: 5000 }, // no confidence - reference point only
    ];
    expect(findMileageMonotonicityViolations(records)).toEqual(["r1"]);
  });

  it("does not flag an AI-derived record that's genuinely consistent with its neighbours", () => {
    const records = [
      { id: "r1", date: "2025-01-01", mileage: 4000, mileageConfidence: "confirmed" as const },
      { id: "r2", date: "2025-02-01", mileage: 5000, mileageConfidence: "estimated" as const },
      { id: "r3", date: "2025-03-01", mileage: 6000, mileageConfidence: "confirmed" as const },
    ];
    expect(findMileageMonotonicityViolations(records)).toEqual([]);
  });

  // A human-typed record with no confidence field is never itself a
  // candidate for flagging, but it still has to serve as a valid
  // reference point for checking its AI-derived neighbours - otherwise
  // an AI-derived record right next to a human entry could never be
  // checked at all.
  it("still uses a human-typed neighbour as a valid comparison point", () => {
    const records = [
      { id: "human", date: "2025-01-01", mileage: 5000 }, // no confidence - never a candidate itself
      { id: "ai", date: "2025-02-01", mileage: 4000, mileageConfidence: "estimated" as const },
    ];
    expect(findMileageMonotonicityViolations(records)).toEqual(["ai"]);
  });

  it("only checks the later neighbour for the first record in the sequence", () => {
    const records = [
      { id: "first", date: "2025-01-01", mileage: 9000, mileageConfidence: "estimated" as const }, // higher than what follows
      { id: "r2", date: "2025-02-01", mileage: 5000 }, // no confidence - reference point only
    ];
    expect(findMileageMonotonicityViolations(records)).toEqual(["first"]);
  });

  it("only checks the earlier neighbour for the last record in the sequence", () => {
    const records = [
      { id: "r1", date: "2025-01-01", mileage: 5000 }, // no confidence - reference point only
      { id: "last", date: "2025-02-01", mileage: 1000, mileageConfidence: "estimated" as const }, // lower than what came before
    ];
    expect(findMileageMonotonicityViolations(records)).toEqual(["last"]);
  });

  it("sorts by date before checking, regardless of input array order", () => {
    const records = [
      { id: "later", date: "2025-02-01", mileage: 4000, mileageConfidence: "estimated" as const },
      { id: "earlier", date: "2025-01-01", mileage: 5000 }, // no confidence - reference point only
    ];
    expect(findMileageMonotonicityViolations(records)).toEqual(["later"]);
  });
});

describe("findImplausibleFuelFills", () => {
  it("returns nothing when there's fewer than two fills to compare", () => {
    expect(findImplausibleFuelFills([])).toEqual([]);
    expect(
      findImplausibleFuelFills([
        { id: "f1", date: "2025-01-01", mileage: 1000, litres: 15, filledToFull: true, mileageConfidence: "confirmed" },
      ])
    ).toEqual([]);
  });

  // Real checkFullTankPlausibility numbers, not mocked - 15L over only
  // 10 miles implies roughly 3mpg, well below what any real petrol
  // engine achieves.
  it("flags a full-tank fill that implies an impossible mpg against the fill before it", () => {
    const logs = [
      { id: "f1", date: "2025-01-01", mileage: 1000, litres: 15, filledToFull: true, mileageConfidence: "confirmed" as const },
      { id: "f2", date: "2025-01-02", mileage: 1010, litres: 15, filledToFull: true, mileageConfidence: "estimated" as const },
    ];
    expect(findImplausibleFuelFills(logs)).toEqual(["f2"]);
  });

  it("does not flag a full-tank fill with a realistic implied mpg", () => {
    const logs = [
      { id: "f1", date: "2025-01-01", mileage: 1000, litres: 15, filledToFull: true, mileageConfidence: "confirmed" as const },
      { id: "f2", date: "2025-01-02", mileage: 1300, litres: 15, filledToFull: true, mileageConfidence: "estimated" as const },
    ];
    expect(findImplausibleFuelFills(logs)).toEqual([]);
  });

  it("never flags a fill with no mileageConfidence, however implausible", () => {
    const logs = [
      { id: "f1", date: "2025-01-01", mileage: 1000, litres: 15, filledToFull: true, mileageConfidence: "confirmed" as const },
      { id: "f2", date: "2025-01-02", mileage: 1010, litres: 15, filledToFull: true }, // no confidence at all
    ];
    expect(findImplausibleFuelFills(logs)).toEqual([]);
  });

  it("never flags a partial top-up, however implausible the numbers would look for a full tank", () => {
    const logs = [
      { id: "f1", date: "2025-01-01", mileage: 1000, litres: 15, filledToFull: true, mileageConfidence: "confirmed" as const },
      { id: "f2", date: "2025-01-02", mileage: 1010, litres: 15, filledToFull: false, mileageConfidence: "estimated" as const },
    ];
    expect(findImplausibleFuelFills(logs)).toEqual([]);
  });

  it("sorts by mileage before comparing, not date or array order", () => {
    const logs = [
      { id: "later-by-mileage", date: "2025-01-01", mileage: 1010, litres: 15, filledToFull: true, mileageConfidence: "estimated" as const },
      { id: "earlier-by-mileage", date: "2025-01-02", mileage: 1000, litres: 15, filledToFull: true, mileageConfidence: "confirmed" as const },
    ];
    // Despite array/date order suggesting otherwise, mileage 1000 precedes
    // 1010 - the implied ~3mpg violation belongs to the higher-mileage one.
    expect(findImplausibleFuelFills(logs)).toEqual(["later-by-mileage"]);
  });
});