import { describe, expect, it } from "vitest";
import { buildCarWalkAwayIssues, CAR_INSPECTION_REQUIRED_RISKS } from "@/lib/tracker/carWalkAwayRisks";
import { buildEvidenceQuality } from "@/lib/tracker/evidenceQuality";

const cleanCar = { dvlaData: undefined } as any;
const cleanMileageCheck = { implausible: false };
const cleanEvidence = buildEvidenceQuality(10, 8, 8, 30, 0);

describe("buildCarWalkAwayIssues", () => {
  it("returns nothing for a genuinely clean car", () => {
    expect(buildCarWalkAwayIssues(cleanCar, cleanMileageCheck, cleanEvidence)).toEqual([]);
  });

  it("flags a car DVLA has recorded as scrapped", () => {
    const car = { dvlaData: { isScrapped: true } } as any;
    const issues = buildCarWalkAwayIssues(car, cleanMileageCheck, cleanEvidence);
    expect(issues.some((i) => i.detail.includes("recorded as scrapped"))).toBe(true);
  });

  it("flags a car DVLA has recorded as exported", () => {
    const car = { dvlaData: { isExported: true } } as any;
    const issues = buildCarWalkAwayIssues(car, cleanMileageCheck, cleanEvidence);
    expect(issues.some((i) => i.detail.includes("recorded as exported"))).toBe(true);
  });

  it("uses the mileage check's own reason when the mileage is implausible", () => {
    const mileageCheck = { implausible: true, reason: "This car would need to average 400mpg." };
    const issues = buildCarWalkAwayIssues(cleanCar, mileageCheck, cleanEvidence);
    expect(issues.find((i) => i.label === "Mileage")?.detail).toBe("This car would need to average 400mpg.");
  });

  it("falls back to a generic message when the mileage check gives no specific reason", () => {
    const mileageCheck = { implausible: true };
    const issues = buildCarWalkAwayIssues(cleanCar, mileageCheck, cleanEvidence);
    expect(issues.find((i) => i.label === "Mileage")?.detail).toContain("doesn't look plausible");
  });

  it("separately flags internally inconsistent mileage history, even when the current mileage itself looks plausible", () => {
    const inconsistentEvidence = buildEvidenceQuality(10, 8, 8, 30, 1); // 1 violation -> internally inconsistent
    const issues = buildCarWalkAwayIssues(cleanCar, cleanMileageCheck, inconsistentEvidence);
    expect(issues.some((i) => i.detail.includes("lower mileage than an earlier one"))).toBe(true);
  });

  it("flags a major documentation gap at the 730-day threshold, with correct year rounding", () => {
    const evidence = buildEvidenceQuality(10, 8, 8, 730, 0); // exactly 2 years
    const issues = buildCarWalkAwayIssues(cleanCar, cleanMileageCheck, evidence);
    expect(issues.some((i) => i.detail.includes("around 2 years"))).toBe(true);
  });

  it("does not flag a gap just under the threshold", () => {
    const evidence = buildEvidenceQuality(10, 8, 8, 729, 0);
    const issues = buildCarWalkAwayIssues(cleanCar, cleanMileageCheck, evidence);
    expect(issues.some((i) => i.label === "Documentation gap")).toBe(false);
  });

  it("exposes a fixed, non-empty list of risks that no digital record can verify, including cambelt/timing", () => {
    expect(CAR_INSPECTION_REQUIRED_RISKS.length).toBeGreaterThan(0);
    expect(CAR_INSPECTION_REQUIRED_RISKS).toContain("Brake condition and wear");
    expect(CAR_INSPECTION_REQUIRED_RISKS.some((r) => r.includes("Cambelt"))).toBe(true);
  });
});
