import { describe, expect, it } from "vitest";
import { buildSellerPrepIssues, buildSellerPrepPlan } from "@/lib/tracker/sellerPrep";
import type { WalkAwayIssue } from "@/lib/tracker/walkAwayRisks";

describe("buildSellerPrepIssues", () => {
  it("returns an empty list for no issues", () => {
    expect(buildSellerPrepIssues([])).toEqual([]);
  });

  it("attaches the matching known suggestion for a recognised label", () => {
    const issues: WalkAwayIssue[] = [{ label: "Mileage", detail: "Mileage inconsistency found." } as any];
    const result = buildSellerPrepIssues(issues);
    expect(result[0].suggestion).toContain("Worth checking your own logged entries");
  });

  it("falls back to a generic prompt for a label with no known suggestion", () => {
    const issues: WalkAwayIssue[] = [{ label: "Some future label", detail: "x" } as any];
    const result = buildSellerPrepIssues(issues);
    expect(result[0].suggestion).toBe("Worth addressing or documenting before you list this bike for sale.");
  });

  it("preserves the original label and detail unchanged", () => {
    const issues: WalkAwayIssue[] = [{ label: "DVLA status", detail: "Flagged as SORN." } as any];
    const result = buildSellerPrepIssues(issues);
    expect(result[0]).toMatchObject({ label: "DVLA status", detail: "Flagged as SORN." });
  });

  it("maps every issue in the list, preserving order", () => {
    const issues: WalkAwayIssue[] = [
      { label: "Mileage", detail: "a" } as any,
      { label: "Documentation gap", detail: "b" } as any,
    ];
    const result = buildSellerPrepIssues(issues);
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe("Mileage");
    expect(result[1].label).toBe("Documentation gap");
  });
});

describe("buildSellerPrepPlan", () => {
  it("always includes the final 'review your full record' step, even with nothing else to flag", () => {
    const steps = buildSellerPrepPlan(100, 0, 0, 0);
    expect(steps).toHaveLength(1);
    expect(steps[0].stage).toBe("Review your full record");
  });

  it("includes an 'attach missing receipts' step only when coverage is below 100%", () => {
    expect(buildSellerPrepPlan(80, 0, 0, 0).some((s) => s.stage === "Attach missing receipts")).toBe(true);
    expect(buildSellerPrepPlan(100, 0, 0, 0).some((s) => s.stage === "Attach missing receipts")).toBe(false);
  });

  it("includes the receipt coverage percentage itself in that step's detail", () => {
    const steps = buildSellerPrepPlan(73, 0, 0, 0);
    expect(steps.find((s) => s.stage === "Attach missing receipts")?.detail).toContain("73%");
  });

  it("includes a 'resolve flagged issues' step only when issueCount is above 0, with correct singular/plural wording", () => {
    expect(buildSellerPrepPlan(100, 0, 0, 0).some((s) => s.stage === "Resolve or explain flagged issues")).toBe(false);
    const singular = buildSellerPrepPlan(100, 1, 0, 0).find((s) => s.stage === "Resolve or explain flagged issues");
    expect(singular?.detail).toContain("1 issue flagged");
    const plural = buildSellerPrepPlan(100, 3, 0, 0).find((s) => s.stage === "Resolve or explain flagged issues");
    expect(plural?.detail).toContain("3 issues flagged");
  });

  it("includes an overdue-items step only when overdueUpcomingCount is above 0, with correct singular/plural wording", () => {
    expect(buildSellerPrepPlan(100, 0, 0, 0).some((s) => s.stage === "Consider handling overdue items now")).toBe(false);
    const singular = buildSellerPrepPlan(100, 0, 1, 0).find((s) => s.stage === "Consider handling overdue items now");
    expect(singular?.detail).toContain("1 overdue item listed");
    const plural = buildSellerPrepPlan(100, 0, 2, 0).find((s) => s.stage === "Consider handling overdue items now");
    expect(plural?.detail).toContain("2 overdue items listed");
  });

  it("includes a 'prepare your answers' step only when questionCount is above 0, with correct singular/plural wording", () => {
    expect(buildSellerPrepPlan(100, 0, 0, 0).some((s) => s.stage === "Prepare your answers")).toBe(false);
    const singular = buildSellerPrepPlan(100, 0, 0, 1).find((s) => s.stage === "Prepare your answers");
    expect(singular?.detail).toContain("1 question a buyer");
    const plural = buildSellerPrepPlan(100, 0, 0, 4).find((s) => s.stage === "Prepare your answers");
    expect(plural?.detail).toContain("4 questions a buyer");
  });

  it("includes every applicable step, in a fixed order, when every condition is triggered at once", () => {
    const steps = buildSellerPrepPlan(50, 2, 1, 3);
    expect(steps.map((s) => s.stage)).toEqual([
      "Attach missing receipts",
      "Resolve or explain flagged issues",
      "Consider handling overdue items now",
      "Prepare your answers",
      "Review your full record",
    ]);
  });
});