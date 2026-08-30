import { describe, expect, it } from "vitest";
import {
  applyKnownBounds,
  estimateFuelMileageFromLitres,
  estimateMileage,
  mileageConfidenceLabel,
} from "@/lib/tracker/mileageEstimate";

const bike = { startingMileage: 3000, currentMileage: 20000, dateAdded: "2024-01-01" };

describe("mileageConfidenceLabel", () => {
  it("labels each confidence level distinctly", () => {
    expect(mileageConfidenceLabel("confirmed")).toContain("confirmed");
    expect(mileageConfidenceLabel("interpolated")).toContain("interpolated");
    expect(mileageConfidenceLabel("estimated")).toContain("estimated");
  });
});

describe("applyKnownBounds", () => {
  it("leaves a mileage unchanged when it's already consistent with everything known", () => {
    const points = [{ date: "2025-01-01", mileage: 4000 }, { date: "2025-03-01", mileage: 5000 }];
    expect(applyKnownBounds(4500, "2025-02-01", points)).toEqual({ mileage: 4500, boundsConflict: false });
  });

  it("adjusts up to stay consistent with a floor it would otherwise fall below", () => {
    const points = [{ date: "2025-01-01", mileage: 4000 }];
    const result = applyKnownBounds(3500, "2025-02-01", points);
    expect(result.mileage).toBe(4000);
    expect(result.boundsWarning).toContain("Adjusted up");
  });

  it("adjusts down to stay consistent with a ceiling it would otherwise exceed", () => {
    const points = [{ date: "2025-03-01", mileage: 5000 }];
    const result = applyKnownBounds(5500, "2025-02-01", points);
    expect(result.mileage).toBe(5000);
    expect(result.boundsWarning).toContain("Adjusted down");
  });

  // The known points themselves disagree - this specific estimate can't
  // safely resolve that by picking a side, so it must flag the conflict
  // rather than silently land somewhere between two contradictory facts.
  it("flags a conflict, without adjusting the mileage, when the known points themselves disagree", () => {
    const points = [
      { date: "2025-01-01", mileage: 6000 }, // floor
      { date: "2025-03-01", mileage: 5000 }, // ceiling, lower than the floor - a real data conflict
    ];
    const result = applyKnownBounds(5500, "2025-02-01", points);
    expect(result.boundsConflict).toBe(true);
    expect(result.mileage).toBe(5500); // unchanged - no side picked
    expect(result.boundsWarning).toContain("disagree with each other");
  });

  it("picks the closest (highest) floor and closest (lowest) ceiling when several candidates exist on each side", () => {
    const points = [
      { date: "2025-01-01", mileage: 3000 },
      { date: "2025-01-15", mileage: 4000 }, // the real closest floor
      { date: "2025-03-01", mileage: 6000 },
      { date: "2025-02-15", mileage: 5000 }, // the real closest ceiling
    ];
    const result = applyKnownBounds(3500, "2025-02-01", points); // below the real 4000 floor
    expect(result.mileage).toBe(4000);
  });
});

describe("estimateFuelMileageFromLitres", () => {
  it("returns null with no preceding full-tank fill to project forward from", () => {
    expect(estimateFuelMileageFromLitres(15, null, 55, bike)).toBeNull();
  });

  it("returns null for non-positive litres", () => {
    expect(estimateFuelMileageFromLitres(0, 5000, 55, bike)).toBeNull();
  });

  it("uses the bike's own average mpg when a genuine one is known", () => {
    // 15L / 4.546 = 3.2996 gallons * 55mpg = ~181.5 miles
    const result = estimateFuelMileageFromLitres(15, 5000, 55, bike);
    expect(result?.mileage).toBe(5000 + Math.round((15 / 4.546) * 55));
    expect(result?.warning).toContain("this bike's own average");
  });

  it("falls back to the generic UK average mpg when the bike has no fuel history yet", () => {
    const result = estimateFuelMileageFromLitres(15, 5000, null, bike);
    expect(result?.warning).toContain("generic 57mpg UK average");
  });

  it("clamps the estimate so it never exceeds the bike's current mileage", () => {
    const result = estimateFuelMileageFromLitres(500, 19999, 55, bike); // absurdly large litres
    expect(result?.mileage).toBe(bike.currentMileage);
  });
});

describe("estimateMileage", () => {
  it("interpolates linearly between two real bracketing points", () => {
    const points = [{ date: "2025-01-01", mileage: 4000 }, { date: "2025-01-11", mileage: 4200 }];
    const result = estimateMileage("2025-01-06", points, bike); // exact halfway
    expect(result).toMatchObject({ mileage: 4100, confidence: "interpolated", requiresManualEntry: false, warning: undefined });
  });

  it("adds a caveat for a wide gap between the bracketing points, but stays automatic", () => {
    const points = [{ date: "2025-01-01", mileage: 4000 }, { date: "2025-08-01", mileage: 5000 }]; // >180 days apart
    const result = estimateMileage("2025-04-01", points, bike);
    expect(result.warning).toContain("wide gap");
    expect(result.requiresManualEntry).toBe(false);
  });

  it("extrapolates forward from a single earlier point within the trusted distance, silently for a nearby date", () => {
    const points = [{ date: "2025-01-01", mileage: 4000 }, { date: "2025-01-11", mileage: 4200 }]; // rate: 20mi/day over a 10-day window
    const result = estimateMileage("2025-01-15", points, bike); // 4 days past the last point
    expect(result.confidence).toBe("estimated");
    expect(result.requiresManualEntry).toBe(false);
    expect(result.warning).toBeUndefined(); // within the 90-day "nearby" threshold
  });

  it("adds a caveat once extrapolating further than the nearby threshold, but stays automatic if still within trust", () => {
    const points = [{ date: "2024-01-01", mileage: 3000 }, { date: "2024-06-01", mileage: 6000 }]; // wide observed window, high trust
    const result = estimateMileage("2024-10-15", points, bike); // 136 days past the last point - past the 90-day "nearby" threshold, still well within this window's trust cap
    expect(result.warning).toContain("extrapolated");
    expect(result.requiresManualEntry).toBe(false);
  });

  // The exact scenario the MAX_EXTRAPOLATION_MULTIPLE constant exists to
  // prevent: a rate observed over a genuinely short window has almost no
  // evidentiary weight far outside it - capped at 3x the observed
  // window, not the much larger absolute hard cap.
  it("refuses to extrapolate a short-observed-window rate past its multiple-based trust cap, even well under the absolute hard cap", () => {
    const points = [{ date: "2025-01-01", mileage: 4000 }, { date: "2025-01-11", mileage: 4200 }]; // 10-day window -> trusted to 30 days
    const result = estimateMileage("2025-02-15", points, bike); // 35 days past the last point - beyond the 30-day trust
    expect(result.requiresManualEntry).toBe(true);
    expect(result.mileage).toBe(4200); // the last known point, unchanged
    expect(result.warning).toContain("too far past the");
  });

  // The other side of the same cap: a genuinely long-observed window is
  // still capped at the absolute hard limit (730 days), not an
  // unbounded multiple of an already-large window.
  it("caps trust at the absolute hard limit even for a long-observed-window rate", () => {
    const points = [{ date: "2022-01-01", mileage: 1000 }, { date: "2024-09-27", mileage: 10000 }]; // ~1000-day window, would allow 3000 days by multiple alone
    const result = estimateMileage("2027-01-01", points, bike); // roughly 3 years past the last point - beyond the 730-day hard cap
    expect(result.requiresManualEntry).toBe(true);
  });

  it("extrapolates backward from a single later point the same way forward extrapolation works", () => {
    const points = [{ date: "2025-06-01", mileage: 8000 }, { date: "2025-06-11", mileage: 8200 }]; // 20mi/day
    const result = estimateMileage("2025-05-28", points, bike); // 4 days before the earlier point
    expect(result.confidence).toBe("estimated");
    expect(result.requiresManualEntry).toBe(false);
    expect(result.mileage).toBeLessThan(8000);
  });

  it("spreads evenly across the bike's whole known lifetime when there are no logged points at all", () => {
    const halfway = new Date((new Date(bike.dateAdded).getTime() + Date.now()) / 2).toISOString().slice(0, 10);
    const result = estimateMileage(halfway, [], bike);
    expect(result.requiresManualEntry).toBe(false);
    expect(result.warning).toContain("No logged records at all");
    expect(result.mileage).toBeGreaterThan(bike.startingMileage);
    expect(result.mileage).toBeLessThan(bike.currentMileage);
  });

  // A real discovery, not assumed going in: even with zero individually
  // logged points, the bike's own overall lifetime rate - startingMileage
  // to currentMileage, spread over dateAdded to now - counts as a
  // genuine bike-specific pace on its own. A moderately old target date
  // doesn't force manual entry the way "no bike-specific pace to trust
  // yet" might suggest; it takes real evidence-based trust into account
  // even from just those three fields.
  it("auto-extrapolates backward from before the bike was added using its own overall lifetime rate, even with zero individually logged points", () => {
    const result = estimateMileage("2023-06-01", [], bike); // moderately before dateAdded, well within even a conservative trust window
    expect(result.requiresManualEntry).toBe(false);
    expect(result.warning).toContain("this bike's own average pace");
  });

  it("requires manual entry once a date is far enough before the bike was added to exceed even the absolute hard trust cap", () => {
    const result = estimateMileage("2021-01-01", [], bike); // ~1095 days before dateAdded (2024-01-01) - beyond the 730-day hard cap regardless of the bike's own observed pace
    expect(result.requiresManualEntry).toBe(true);
    expect(result.mileage).toBe(bike.startingMileage);
  });

  // Even a clean, otherwise-automatic interpolation must still respect
  // an out-of-band bounds point (e.g. an already-committed batch peer)
  // passed separately via allPointsForBounds - and a genuine conflict
  // there forces manual entry, overriding what would otherwise be a
  // confident automatic result.
  it("forces manual entry when an otherwise-clean interpolation conflicts with a separately-supplied bounds point", () => {
    const points = [{ date: "2025-01-01", mileage: 4000 }, { date: "2025-01-11", mileage: 4200 }];
    const conflictingBounds = [
      { date: "2025-01-01", mileage: 4000 },
      { date: "2025-01-11", mileage: 4200 },
      { date: "2025-01-20", mileage: 3900 }, // a later point with LOWER mileage - a real conflict with the ceiling logic
    ];
    const result = estimateMileage("2025-01-06", points, bike, conflictingBounds);
    expect(result.requiresManualEntry).toBe(true);
  });

  it("never returns a mileage below zero or above the bike's current mileage", () => {
    const result = estimateMileage("2020-01-01", [], { ...bike, startingMileage: 0 });
    expect(result.mileage).toBeGreaterThanOrEqual(0);
    expect(result.mileage).toBeLessThanOrEqual(bike.currentMileage);
  });
});