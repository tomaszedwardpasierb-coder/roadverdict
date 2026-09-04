import { describe, expect, it } from "vitest";
import { buildCostPerMileVerdict, pickWinnerId } from "@/lib/tracker/bikeComparisonVerdict";

describe("buildCostPerMileVerdict", () => {
  it("returns null when fewer than two bikes have a real cost/mile figure", () => {
    expect(buildCostPerMileVerdict([{ bikeId: "a", name: "Africa Twin", costPerMile: 0.12 }])).toBeNull();
    expect(buildCostPerMileVerdict([
      { bikeId: "a", name: "Africa Twin", costPerMile: 0.12 },
      { bikeId: "b", name: "Tiger", costPerMile: null },
    ])).toBeNull();
  });

  it("phrases a two-bike comparison as a direct percentage", () => {
    const verdict = buildCostPerMileVerdict([
      { bikeId: "a", name: "Africa Twin", costPerMile: 0.10 },
      { bikeId: "b", name: "Tiger", costPerMile: 0.20 },
    ]);
    expect(verdict).toBe("Africa Twin costs you 50% less per mile than Tiger.");
  });

  it("phrases a 3+ bike comparison against the next-best, not every other bike", () => {
    const verdict = buildCostPerMileVerdict([
      { bikeId: "a", name: "Africa Twin", costPerMile: 0.10 },
      { bikeId: "b", name: "Tiger", costPerMile: 0.20 },
      { bikeId: "c", name: "MT-09", costPerMile: 0.15 },
    ]);
    expect(verdict).toBe("Africa Twin is your cheapest bike to run, by 33% over your next-best, MT-09.");
  });

  it("returns null when the cheapest and next-best are tied (0% headline would be meaningless)", () => {
    const verdict = buildCostPerMileVerdict([
      { bikeId: "a", name: "Africa Twin", costPerMile: 0.15 },
      { bikeId: "b", name: "Tiger", costPerMile: 0.15 },
    ]);
    expect(verdict).toBeNull();
  });

  it("ignores bikes with no cost/mile data when picking the comparison pair", () => {
    const verdict = buildCostPerMileVerdict([
      { bikeId: "a", name: "Africa Twin", costPerMile: 0.10 },
      { bikeId: "b", name: "Tiger", costPerMile: null },
      { bikeId: "c", name: "MT-09", costPerMile: 0.20 },
    ]);
    expect(verdict).toBe("Africa Twin costs you 50% less per mile than MT-09.");
  });
});

describe("pickWinnerId", () => {
  it("returns null with fewer than two valid values", () => {
    expect(pickWinnerId([{ bikeId: "a", value: 5 }], "lower")).toBeNull();
    expect(pickWinnerId([{ bikeId: "a", value: 5 }, { bikeId: "b", value: null }], "lower")).toBeNull();
  });

  it("picks the lowest value for direction 'lower'", () => {
    expect(pickWinnerId([{ bikeId: "a", value: 0.2 }, { bikeId: "b", value: 0.1 }], "lower")).toBe("b");
  });

  it("picks the highest value for direction 'higher'", () => {
    expect(pickWinnerId([{ bikeId: "a", value: 40 }, { bikeId: "b", value: 55 }], "higher")).toBe("b");
  });

  it("returns null when the best value is tied across bikes", () => {
    expect(pickWinnerId([{ bikeId: "a", value: 50 }, { bikeId: "b", value: 50 }], "higher")).toBeNull();
  });

  it("skips null values when comparing more than two bikes", () => {
    expect(pickWinnerId([
      { bikeId: "a", value: null },
      { bikeId: "b", value: 30 },
      { bikeId: "c", value: 45 },
    ], "higher")).toBe("c");
  });
});
