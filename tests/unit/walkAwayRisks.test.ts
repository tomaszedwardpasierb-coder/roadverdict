import { describe, expect, it } from "vitest";
import { buildWalkAwayIssues, INSPECTION_REQUIRED_RISKS } from "@/lib/tracker/walkAwayRisks";
import { buildEvidenceQuality } from "@/lib/tracker/evidenceQuality";

const cleanBike = { dvlaData: undefined } as any;
const cleanMileageCheck = { implausible: false };
const cleanEvidence = buildEvidenceQuality(10, 8, 8, 30, 0);

describe("buildWalkAwayIssues", () => {
  it("returns nothing for a genuinely clean bike", () => {
    expect(buildWalkAwayIssues(cleanBike, cleanMileageCheck, cleanEvidence)).toEqual([]);
  });

  it("flags a bike DVLA has recorded as scrapped", () => {
    const bike = { dvlaData: { isScrapped: true } } as any;
    const issues = buildWalkAwayIssues(bike, cleanMileageCheck, cleanEvidence);
    expect(issues.some((i) => i.detail.includes("recorded as scrapped"))).toBe(true);
  });

  it("flags a bike DVLA has recorded as exported", () => {
    const bike = { dvlaData: { isExported: true } } as any;
    const issues = buildWalkAwayIssues(bike, cleanMileageCheck, cleanEvidence);
    expect(issues.some((i) => i.detail.includes("recorded as exported"))).toBe(true);
  });

  it("uses the mileage check's own reason when the mileage is implausible", () => {
    const mileageCheck = { implausible: true, reason: "This bike would need to average 400mpg." };
    const issues = buildWalkAwayIssues(cleanBike, mileageCheck, cleanEvidence);
    expect(issues.find((i) => i.label === "Mileage")?.detail).toBe("This bike would need to average 400mpg.");
  });

  it("falls back to a generic message when the mileage check gives no specific reason", () => {
    const mileageCheck = { implausible: true };
    const issues = buildWalkAwayIssues(cleanBike, mileageCheck, cleanEvidence);
    expect(issues.find((i) => i.label === "Mileage")?.detail).toContain("doesn't look plausible");
  });

  // Genuinely independent from the mileage-plausibility check above - a
  // bike can fail one, the other, both, or neither, so both need their
  // own coverage rather than assuming one implies the other.
  it("separately flags internally inconsistent mileage history, even when the current mileage itself looks plausible", () => {
    const inconsistentEvidence = buildEvidenceQuality(10, 8, 8, 30, 1); // 1 violation -> internally inconsistent
    const issues = buildWalkAwayIssues(cleanBike, cleanMileageCheck, inconsistentEvidence);
    expect(issues.some((i) => i.detail.includes("lower mileage than an earlier one"))).toBe(true);
  });

  it("flags a major documentation gap at the 730-day threshold, with correct year rounding", () => {
    const evidence = buildEvidenceQuality(10, 8, 8, 730, 0); // exactly 2 years
    const issues = buildWalkAwayIssues(cleanBike, cleanMileageCheck, evidence);
    expect(issues.some((i) => i.detail.includes("around 2 years"))).toBe(true);
  });

  it("does not flag a gap just under the threshold", () => {
    const evidence = buildEvidenceQuality(10, 8, 8, 729, 0);
    const issues = buildWalkAwayIssues(cleanBike, cleanMileageCheck, evidence);
    expect(issues.some((i) => i.label === "Documentation gap")).toBe(false);
  });

  it("exposes a fixed, non-empty list of risks that no digital record can verify", () => {
    expect(INSPECTION_REQUIRED_RISKS.length).toBeGreaterThan(0);
    expect(INSPECTION_REQUIRED_RISKS).toContain("Brake condition and wear");
  });
});