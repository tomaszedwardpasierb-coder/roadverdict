import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ callGeminiForJson: vi.fn() }));
vi.mock("@/lib/tracker/geminiJsonCall", () => ({ callGeminiForJson: mocks.callGeminiForJson }));

import { generateCostAdvice, type CostAdviceInput } from "@/lib/tracker/costAdvice";

const baseInput: CostAdviceInput = {
  bikeClassLabel: "Medium",
  brandLabel: "Yamaha",
  regionLabel: "Rest of England & Wales",
  annualMileage: 4000,
  breakdown: { servicing: 180, tyres: 140, mot: 28, tax: 125, fuel: 463, total: 936 },
};

describe("generateCostAdvice", () => {
  beforeEach(() => {
    mocks.callGeminiForJson.mockReset();
    mocks.callGeminiForJson.mockResolvedValue({ explanation: "x", watchOutFor: [] });
  });

  it("returns exactly whatever callGeminiForJson resolves to, including null", async () => {
    mocks.callGeminiForJson.mockResolvedValue(null);
    expect(await generateCostAdvice(baseInput, "k")).toBeNull();
  });

  it("builds a facts block with every line item and the total, already computed and not to be recalculated", async () => {
    await generateCostAdvice(baseInput, "k");
    const factsBlock = mocks.callGeminiForJson.mock.calls[0][1];
    expect(factsBlock).toContain("Servicing: £180");
    expect(factsBlock).toContain("Tyres: £140");
    expect(factsBlock).toContain("MOT: £28");
    expect(factsBlock).toContain("Road tax (VED): £125");
    expect(factsBlock).toContain("Fuel: £463");
    expect(factsBlock).toContain("Total: £936");
    expect(factsBlock).toContain("already calculated, do not recompute");
  });

  // The specific guarantee named in the source comment: the breakdown
  // this reads from deliberately excludes insurance, already explained
  // to the reader elsewhere on the page - this addition must not
  // quietly contradict that by speculating about it anyway.
  it("explicitly instructs the model never to speculate about insurance", async () => {
    await generateCostAdvice(baseInput, "k");
    const systemPrompt = mocks.callGeminiForJson.mock.calls[0][0];
    expect(systemPrompt).toContain("Do not speculate about insurance costs");
    expect(systemPrompt).toContain("do not list it as something to watch out for");
  });

  it("tells the model not to judge affordability for the reader", async () => {
    await generateCostAdvice(baseInput, "k");
    const systemPrompt = mocks.callGeminiForJson.mock.calls[0][0];
    expect(systemPrompt).toContain("Do not tell the reader whether this bike is affordable");
  });

  describe("its validate function", () => {
    async function capturedValidate() {
      await generateCostAdvice(baseInput, "k");
      return mocks.callGeminiForJson.mock.calls[0][3];
    }

    it("accepts a well-formed shape", async () => {
      const validate = await capturedValidate();
      expect(validate({ explanation: "Fuel is the largest share.", watchOutFor: ["Tyre wear varies with riding style."] })).toEqual({
        explanation: "Fuel is the largest share.",
        watchOutFor: ["Tyre wear varies with riding style."],
      });
    });

    it("accepts an empty watchOutFor array, which the prompt explicitly allows", async () => {
      const validate = await capturedValidate();
      expect(validate({ explanation: "x", watchOutFor: [] })).toEqual({ explanation: "x", watchOutFor: [] });
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