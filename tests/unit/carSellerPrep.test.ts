// buildSellerPrepPlan is reused directly (not duplicated) for cars -
// see carSellerPrep.ts's own comment - so it's not re-tested here; its
// coverage lives in tests/unit/sellerPrep.test.ts. Only
// buildCarSellerPrepIssues (the one function actually mirrored, for its
// one car-specific fallback string) is covered here.
import { describe, expect, it } from "vitest";
import { buildCarSellerPrepIssues } from "@/lib/tracker/carSellerPrep";
import type { CarWalkAwayIssue } from "@/lib/tracker/carWalkAwayRisks";

describe("buildCarSellerPrepIssues", () => {
  it("returns an empty list for no issues", () => {
    expect(buildCarSellerPrepIssues([])).toEqual([]);
  });

  it("attaches the matching known suggestion for a recognised label", () => {
    const issues: CarWalkAwayIssue[] = [{ label: "Mileage", detail: "Mileage inconsistency found." }];
    const result = buildCarSellerPrepIssues(issues);
    expect(result[0].suggestion).toContain("Worth checking your own logged entries");
  });

  it("falls back to a car-specific generic prompt for a label with no known suggestion", () => {
    const issues: CarWalkAwayIssue[] = [{ label: "Some future label", detail: "x" }];
    const result = buildCarSellerPrepIssues(issues);
    expect(result[0].suggestion).toBe("Worth addressing or documenting before you list this car for sale.");
  });

  it("preserves the original label and detail unchanged", () => {
    const issues: CarWalkAwayIssue[] = [{ label: "DVLA status", detail: "Flagged as SORN." }];
    const result = buildCarSellerPrepIssues(issues);
    expect(result[0]).toMatchObject({ label: "DVLA status", detail: "Flagged as SORN." });
  });

  it("maps every issue in the list, preserving order", () => {
    const issues: CarWalkAwayIssue[] = [
      { label: "Mileage", detail: "a" },
      { label: "Documentation gap", detail: "b" },
    ];
    const result = buildCarSellerPrepIssues(issues);
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe("Mileage");
    expect(result[1].label).toBe("Documentation gap");
  });
});
