import { describe, expect, it } from "vitest";
import { buildBuyerActionPlan } from "@/lib/tracker/buyerActionPlan";

describe("buildBuyerActionPlan", () => {
  it("always returns exactly five steps in the fixed order", () => {
    const plan = buildBuyerActionPlan(3, 2);
    expect(plan.map((s) => s.stage)).toEqual([
      "Before contacting the seller",
      "Ask the seller",
      "Verify independently",
      "Inspect in person",
      "Decide after inspection",
    ]);
  });

  it("names the specific question count, correctly pluralised", () => {
    expect(buildBuyerActionPlan(1, 0)[1].detail).toContain("the 1 question above");
    expect(buildBuyerActionPlan(3, 0)[1].detail).toContain("the 3 questions above");
  });

  it("falls back to generic wording when there are no generated questions", () => {
    expect(buildBuyerActionPlan(0, 0)[1].detail).toContain("No specific questions were generated");
  });

  it("names the specific walk-away issue count, correctly pluralised", () => {
    expect(buildBuyerActionPlan(0, 1)[4].detail).toContain("1 potential walk-away issue flagged");
    expect(buildBuyerActionPlan(0, 3)[4].detail).toContain("3 potential walk-away issues flagged");
  });

  it("falls back to generic wording when there are no walk-away issues", () => {
    expect(buildBuyerActionPlan(0, 0)[4].detail).toBe(
      "Weigh what the inspection finds against everything in this report before deciding."
    );
  });
});