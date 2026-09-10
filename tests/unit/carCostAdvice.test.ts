// Mirrors costAdvice.test.ts - car equivalent, this module is new (car
// cost calculator had no AI advice at all before this).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ callGeminiForJson: vi.fn() }));
vi.mock("@/lib/tracker/geminiJsonCall", () => ({ callGeminiForJson: mocks.callGeminiForJson }));

import { generateCarCostAdvice, type CarCostAdviceInput } from "@/lib/tracker/carCostAdvice";

const baseInput: CarCostAdviceInput = {
  carClassLabel: "Medium",
  brandLabel: "Ford",
  regionLabel: "Rest of England & Wales",
  annualMileage: 7000,
  breakdown: { servicing: 250, tyres: 120, mot: 37, tax: 190, fuel: 900, total: 1497, vedUnknown: false, vedCaveat: "Standard rate, year 2 onward." },
};

describe("generateCarCostAdvice", () => {
  beforeEach(() => {
    mocks.callGeminiForJson.mockReset();
    mocks.callGeminiForJson.mockResolvedValue({ explanation: "x", watchOutFor: [] });
  });

  it("returns exactly whatever callGeminiForJson resolves to, including null", async () => {
    mocks.callGeminiForJson.mockResolvedValue(null);
    expect(await generateCarCostAdvice(baseInput, "k")).toBeNull();
  });

  it("builds a facts block with every line item and the total, already computed and not to be recalculated", async () => {
    await generateCarCostAdvice(baseInput, "k");
    const factsBlock = mocks.callGeminiForJson.mock.calls[0][1];
    expect(factsBlock).toContain("Servicing: £250");
    expect(factsBlock).toContain("Tyres: £120");
    expect(factsBlock).toContain("MOT: £37");
    expect(factsBlock).toContain("Road tax (VED): £190");
    expect(factsBlock).toContain("Fuel: £900");
    expect(factsBlock).toContain("Total: £1497");
    expect(factsBlock).toContain("already calculated, do not recompute");
  });

  it("shows £0 tax with the vedUnknown caveat when no CO2 figure was entered", async () => {
    const input: CarCostAdviceInput = { ...baseInput, breakdown: { ...baseInput.breakdown, tax: 0, vedUnknown: true, vedCaveat: "No CO2 entered." } };
    await generateCarCostAdvice(input, "k");
    const factsBlock = mocks.callGeminiForJson.mock.calls[0][1];
    expect(factsBlock).toContain("Road tax (VED): £0 (no CO2 figure was entered, so this is not a real estimate - No CO2 entered.)");
  });

  it("explicitly instructs the model never to speculate about insurance", async () => {
    await generateCarCostAdvice(baseInput, "k");
    const systemPrompt = mocks.callGeminiForJson.mock.calls[0][0];
    expect(systemPrompt).toContain("Do not speculate about insurance costs");
    expect(systemPrompt).toContain("do not list it as something to watch out for");
  });

  it("tells the model not to judge affordability for the reader", async () => {
    await generateCarCostAdvice(baseInput, "k");
    const systemPrompt = mocks.callGeminiForJson.mock.calls[0][0];
    expect(systemPrompt).toContain("Do not tell the reader whether this car is affordable");
  });

  it("omits the tax-status and MOT-history blocks entirely when neither was given", async () => {
    await generateCarCostAdvice(baseInput, "k");
    const factsBlock = mocks.callGeminiForJson.mock.calls[0][1];
    expect(factsBlock).not.toContain("REAL DVLA TAX STATUS");
    expect(factsBlock).not.toContain("REAL MOT HISTORY");
  });

  it("includes the real DVLA tax status when given", async () => {
    const input: CarCostAdviceInput = {
      ...baseInput,
      taxStatus: { taxStatus: "Taxed", taxIsCurrentlyValid: true, taxDueDate: "2027-06-01", taxDaysRemaining: 263, vedStandardTwelveMonths: 190 },
    };
    await generateCarCostAdvice(input, "k");
    const factsBlock = mocks.callGeminiForJson.mock.calls[0][1];
    expect(factsBlock).toContain("REAL DVLA TAX STATUS FOR THIS EXACT CAR (independent of the benchmark tax figure above)");
    expect(factsBlock).toContain("DVLA-confirmed standard rate: £190/year");
  });

  it("flags a not-currently-valid tax status plainly", async () => {
    const input: CarCostAdviceInput = {
      ...baseInput,
      taxStatus: { taxStatus: "SORN", taxIsCurrentlyValid: false, taxDueDate: null, taxDaysRemaining: null, vedStandardTwelveMonths: null },
    };
    await generateCarCostAdvice(input, "k");
    const factsBlock = mocks.callGeminiForJson.mock.calls[0][1];
    expect(factsBlock).toContain("Status: SORN - NOT currently valid");
  });

  it("includes real MOT history, oldest-to-newest, when given", async () => {
    const input: CarCostAdviceInput = {
      ...baseInput,
      motTests: [
        { testDate: "2025-06-01", passed: true, notes: "" },
        { testDate: "2024-06-01", passed: false, notes: "Structural corrosion advisory" },
      ],
    };
    await generateCarCostAdvice(input, "k");
    const factsBlock = mocks.callGeminiForJson.mock.calls[0][1];
    expect(factsBlock).toContain("THIS CAR'S REAL MOT HISTORY");
    const idx2024 = factsBlock.indexOf("2024");
    const idx2025 = factsBlock.indexOf("2025");
    expect(idx2024).toBeGreaterThan(-1);
    expect(idx2025).toBeGreaterThan(idx2024);
  });

  describe("its validate function", () => {
    async function capturedValidate() {
      await generateCarCostAdvice(baseInput, "k");
      return mocks.callGeminiForJson.mock.calls[0][3];
    }

    it("accepts a well-formed shape", async () => {
      const validate = await capturedValidate();
      expect(validate({ explanation: "Fuel is the largest share.", watchOutFor: ["Tyre wear varies with driving style."] })).toEqual({
        explanation: "Fuel is the largest share.",
        watchOutFor: ["Tyre wear varies with driving style."],
      });
    });

    it("rejects a shape with no explanation string, or with watchOutFor not an array", async () => {
      const validate = await capturedValidate();
      expect(validate({ watchOutFor: [] })).toBeNull();
      expect(validate({ explanation: "x", watchOutFor: "not an array" })).toBeNull();
    });

    it("filters out non-string entries in watchOutFor rather than rejecting the whole response", async () => {
      const validate = await capturedValidate();
      expect(validate({ explanation: "x", watchOutFor: ["real point", 99, "another"] })).toEqual({
        explanation: "x",
        watchOutFor: ["real point", "another"],
      });
    });
  });
});
