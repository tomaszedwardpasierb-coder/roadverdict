// Place at: tests/unit/motorcycleVed.test.ts
import { describe, expect, it } from "vitest";
import { MOTORCYCLE_VED_BANDS, vedBandForEngineCc } from "@/lib/motorcycleVed";

describe("motorcycle VED bands", () => {
  it("puts each engine size in the GOV.UK band, boundaries included", () => {
    expect(vedBandForEngineCc(124).twelveMonths).toBe(27);
    expect(vedBandForEngineCc(150).twelveMonths).toBe(27);
    expect(vedBandForEngineCc(151).twelveMonths).toBe(59);
    expect(vedBandForEngineCc(400).twelveMonths).toBe(59);
    expect(vedBandForEngineCc(401).twelveMonths).toBe(90);
    expect(vedBandForEngineCc(599).twelveMonths).toBe(90);
    expect(vedBandForEngineCc(600).twelveMonths).toBe(90);
    expect(vedBandForEngineCc(601).twelveMonths).toBe(125);
    expect(vedBandForEngineCc(689).twelveMonths).toBe(125);
  });

  it("charges 5% more for monthly Direct Debit, as GOV.UK does", () => {
    for (const b of MOTORCYCLE_VED_BANDS) {
      expect(b.monthlyTotal).toBeCloseTo(b.twelveMonths * 1.05, 2);
    }
  });
});
