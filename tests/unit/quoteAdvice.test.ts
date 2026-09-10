import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ callGeminiForJson: vi.fn() }));
vi.mock("@/lib/tracker/geminiJsonCall", () => ({ callGeminiForJson: mocks.callGeminiForJson }));

import { generateQuoteAdvice, type QuoteAdviceInput } from "@/lib/tracker/quoteAdvice";

const baseInput: QuoteAdviceInput = {
  jobLabel: "Full service",
  bikeClassLabel: "Medium",
  brandLabel: "Yamaha",
  brandTier: "mainstream",
  regionLabel: "Rest of England & Wales",
  quotedPrice: 220,
  range: { low: 150, high: 200 },
  verdictLabel: "High",
  sourceConfidence: "higher",
  sourceNote: undefined,
  communityStats: null,
};

describe("generateQuoteAdvice", () => {
  beforeEach(() => {
    mocks.callGeminiForJson.mockReset();
    mocks.callGeminiForJson.mockResolvedValue({ explanation: "x", questionsToAsk: [] });
  });

  it("passes the api key straight through", async () => {
    await generateQuoteAdvice(baseInput, "my-key");
    expect(mocks.callGeminiForJson).toHaveBeenCalledWith(expect.any(String), expect.any(String), "my-key", expect.any(Function), "quoteAdvice");
  });

  it("returns exactly whatever callGeminiForJson resolves to, including null", async () => {
    mocks.callGeminiForJson.mockResolvedValue(null);
    expect(await generateQuoteAdvice(baseInput, "k")).toBeNull();

    mocks.callGeminiForJson.mockResolvedValue({ explanation: "e", questionsToAsk: ["q"] });
    expect(await generateQuoteAdvice(baseInput, "k")).toEqual({ explanation: "e", questionsToAsk: ["q"] });
  });

  it("builds a facts block with the quoted price, range, and verdict", async () => {
    await generateQuoteAdvice(baseInput, "k");
    const factsBlock = mocks.callGeminiForJson.mock.calls[0][1];
    expect(factsBlock).toContain("QUOTED PRICE: £220");
    expect(factsBlock).toContain("TYPICAL RANGE FOR THIS COMBINATION: £150-£200");
    expect(factsBlock).toContain("VERDICT: High");
  });

  it("includes community-reported data in the facts block when present", async () => {
    const input = { ...baseInput, communityStats: { sampleSize: 12, low: 180, high: 240 } };
    await generateQuoteAdvice(input, "k");
    const factsBlock = mocks.callGeminiForJson.mock.calls[0][1];
    expect(factsBlock).toContain("12 riders reported £180-£240");
  });

  it("explicitly notes the absence of community data rather than omitting the line silently", async () => {
    await generateQuoteAdvice(baseInput, "k"); // communityStats: null
    const factsBlock = mocks.callGeminiForJson.mock.calls[0][1];
    expect(factsBlock).toContain("No community-reported data available");
  });

  it("instructs the model never to invent a reason for a price, and never to tell the reader whether to accept", async () => {
    await generateQuoteAdvice(baseInput, "k");
    const systemPrompt = mocks.callGeminiForJson.mock.calls[0][0];
    expect(systemPrompt).toContain("never invent a reason for a price");
    expect(systemPrompt).toContain("Do not tell them whether to accept the quote");
  });

  describe("its validate function", () => {
    async function capturedValidate() {
      await generateQuoteAdvice(baseInput, "k");
      return mocks.callGeminiForJson.mock.calls[0][3];
    }

    it("accepts a well-formed shape", async () => {
      const validate = await capturedValidate();
      expect(validate({ explanation: "It's about 15% over.", questionsToAsk: ["What's included?"] })).toEqual({
        explanation: "It's about 15% over.",
        questionsToAsk: ["What's included?"],
      });
    });

    it("rejects a shape with no explanation string", async () => {
      const validate = await capturedValidate();
      expect(validate({ questionsToAsk: ["x"] })).toBeNull();
      expect(validate({ explanation: 123, questionsToAsk: [] })).toBeNull();
    });

    it("rejects a shape where questionsToAsk isn't an array", async () => {
      const validate = await capturedValidate();
      expect(validate({ explanation: "x", questionsToAsk: "not an array" })).toBeNull();
    });

    it("filters out any non-string entries in questionsToAsk rather than rejecting the whole response", async () => {
      const validate = await capturedValidate();
      expect(validate({ explanation: "x", questionsToAsk: ["real question", 42, null, "another"] })).toEqual({
        explanation: "x",
        questionsToAsk: ["real question", "another"],
      });
    });
  });

  it("omits the MOT history block entirely when no motTests were given (manual entry, no lookup)", async () => {
    await generateQuoteAdvice(baseInput, "k");
    const factsBlock = mocks.callGeminiForJson.mock.calls[0][1];
    expect(factsBlock).not.toContain("REAL MOT HISTORY");
  });

  it("includes the real MOT history, oldest-to-newest, when motTests were given", async () => {
    const input: QuoteAdviceInput = {
      ...baseInput,
      motTests: [
        { testDate: "2025-06-01", passed: true, notes: "" },
        { testDate: "2024-06-01", passed: false, notes: "Rear brake pads worn" },
      ],
    };
    await generateQuoteAdvice(input, "k");
    const factsBlock = mocks.callGeminiForJson.mock.calls[0][1];
    expect(factsBlock).toContain("THIS BIKE'S REAL MOT HISTORY");
    // oldest first: 2024 then 2025, even though the input was newest-first
    const idx2024 = factsBlock.indexOf("2024");
    const idx2025 = factsBlock.indexOf("2025");
    expect(idx2024).toBeGreaterThan(-1);
    expect(idx2025).toBeGreaterThan(idx2024);
    expect(factsBlock).toContain("Rear brake pads worn");
  });

  it("instructs the model to connect a relevant MOT advisory to the quoted job as a legitimate reason for a higher price", async () => {
    await generateQuoteAdvice(baseInput, "k");
    const systemPrompt = mocks.callGeminiForJson.mock.calls[0][0];
    expect(systemPrompt).toContain("legitimate reason the price might run above a generic benchmark");
  });
});