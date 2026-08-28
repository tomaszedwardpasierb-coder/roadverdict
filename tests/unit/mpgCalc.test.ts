import { describe, expect, it } from "vitest";
import { computeMPGSeries } from "@/lib/tracker/mpgCalc";

const fill = (overrides: Partial<Parameters<typeof computeMPGSeries>[0][number]> = {}) => ({
  id: "fuel-1",
  mileage: 1000,
  litres: 10,
  filledToFull: true,
  date: "2025-01-01",
  ...overrides,
});

describe("computeMPGSeries", () => {
  it("calculates a segment between full fills", () => {
    const result = computeMPGSeries([
      fill({ id: "fuel-1", mileage: 1000 }),
      fill({ id: "fuel-2", mileage: 1100, litres: 10, date: "2025-02-01" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].mpg).toBeCloseTo(45.46, 1);
    expect(result[0].likelyMissedFillUps).toBe(false);
  });

  it("does not bridge an unverified mileage entry", () => {
    const result = computeMPGSeries([
      fill({ id: "fuel-1", mileage: 1000 }),
      fill({ id: "fuel-estimated", mileage: 1050, mileageConfidence: "estimated" }),
      fill({ id: "fuel-2", mileage: 1100, date: "2025-02-01" }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("keeps an explicitly marked anomaly visible but excluded", () => {
    const result = computeMPGSeries([
      fill({ id: "fuel-1", mileage: 1000 }),
      fill({ id: "fuel-2", mileage: 1100, date: "2025-02-01", mileageAnomaly: true }),
    ]);
    expect(result[0]).toMatchObject({ likelyMissedFillUps: true, exclusionReason: "marked-anomaly" });
  });
});