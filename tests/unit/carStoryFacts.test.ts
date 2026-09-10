// Mirrors storyFacts.test.ts's computeBikeIdentity describe block for
// the car equivalent - computeCategorySpend/computeServiceRhythm/
// computeMpgTrend/jobLabel are reused directly from storyFacts.ts (see
// carStoryFacts.ts's own comment) and already have coverage there.
import { describe, expect, it } from "vitest";
import { computeCarIdentity } from "@/lib/tracker/carStoryFacts";

describe("computeCarIdentity", () => {
  it("carries the car's own fields through, including a computed logged-span in years", () => {
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 86_400_000).toISOString();
    const identity = computeCarIdentity(
      { make: "Ford", model: "Focus", year: 2019, currentMileage: 8000, dateAdded: twoYearsAgo },
      42
    );
    expect(identity).toMatchObject({ make: "Ford", model: "Focus", year: 2019, currentMileage: 8000, loggedSinceDate: twoYearsAgo, totalLoggedEvents: 42 });
    expect(identity.loggedSpanYears).toBeGreaterThan(1.9);
    expect(identity.loggedSpanYears).toBeLessThan(2.1);
  });

  it("leaves year undefined for a car with none recorded", () => {
    const identity = computeCarIdentity({ make: "Ford", model: "Focus", year: undefined, currentMileage: 100, dateAdded: new Date().toISOString() }, 0);
    expect(identity.year).toBeUndefined();
  });
});
