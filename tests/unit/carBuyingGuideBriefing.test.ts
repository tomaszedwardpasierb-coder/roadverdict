// Place at: tests/unit/carBuyingGuideBriefing.test.ts
// Mirrors buyingGuideBriefing.test.ts's own coverage, adjusted for the
// newer systemInstruction request shape (facts live in `contents`, the
// car-specific rules live in `systemInstruction`) and the extra
// fuel-type-aware/MOT-category assertions unique to this file.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ logGeminiUsage: vi.fn() }));
vi.mock("@/lib/tracker/geminiUsageLog", () => ({ logGeminiUsage: mocks.logGeminiUsage }));

import { generateCarBuyingGuideBriefing, type CarBuyingGuideBriefingInput } from "@/lib/tracker/carBuyingGuideBriefing";

function geminiResponse(bodyText: string) {
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: bodyText }] } }] }) };
}

const validResult = { motFlags: [], modelNotes: ["Known dual-mass flywheel weak point on this generation."], summary: "A clean history overall." };

const baseInput: CarBuyingGuideBriefingInput = {
  make: "Ford",
  model: "Focus",
  fuelType: "PETROL",
  motTests: [],
};

describe("generateCarBuyingGuideBriefing", () => {
  beforeEach(() => mocks.logGeminiUsage.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it("returns the parsed briefing on a well-formed response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult))));
    expect(await generateCarBuyingGuideBriefing(baseInput, "key")).toEqual(validResult);
  });

  it("logs Gemini usage under the carBuyingGuideBriefing task on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult))));
    await generateCarBuyingGuideBriefing(baseInput, "key");
    expect(mocks.logGeminiUsage).toHaveBeenCalledWith("carBuyingGuideBriefing", expect.any(String), true);
  });

  it("fails soft to null on a non-ok HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    expect(await generateCarBuyingGuideBriefing(baseInput, "key")).toBeNull();
  });

  it("fails soft to null when fetch itself throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    expect(await generateCarBuyingGuideBriefing(baseInput, "key")).toBeNull();
  });

  it("fails soft to null when the model's own text isn't valid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse("not json")));
    expect(await generateCarBuyingGuideBriefing(baseInput, "key")).toBeNull();
  });

  it("fails soft to null when the parsed shape is missing the summary string", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({ motFlags: [], modelNotes: [] }))));
    expect(await generateCarBuyingGuideBriefing(baseInput, "key")).toBeNull();
  });

  it("filters non-string entries out of motFlags and modelNotes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({
      motFlags: ["real", 1], modelNotes: [null, "also real"], summary: "x",
    }))));
    expect(await generateCarBuyingGuideBriefing(baseInput, "key")).toEqual({
      motFlags: ["real"], modelNotes: ["also real"], summary: "x",
    });
  });

  it("puts the car's facts in the contents block, not the system instruction", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateCarBuyingGuideBriefing(baseInput, "key");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].text).toContain("CAR: Ford Focus");
    expect(body.contents[0].parts[0].text).toContain("FUEL TYPE: PETROL");
  });

  it("states plainly when there's no MOT history on record, rather than an empty section", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateCarBuyingGuideBriefing(baseInput, "key"); // motTests: []
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].text).toContain("No MOT test history on record for this registration.");
  });

  it("lists real MOT tests oldest-to-newest with date, result, mileage, and notes", async () => {
    const input: CarBuyingGuideBriefingInput = {
      ...baseInput,
      motTests: [
        { testDate: "2023-05-01", passed: true, mileage: 12000, notes: "" },
        { testDate: "2024-05-01", passed: false, mileage: 14500, notes: "DANGEROUS: Brakes: Rear brake pads worn beyond limit" },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);

    await generateCarBuyingGuideBriefing(input, "key");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const prompt = body.contents[0].parts[0].text;
    expect(prompt).toContain("1 May 2023 - Passed - 12,000 miles");
    expect(prompt).toContain("1 May 2024 - Failed - 14,500 miles - DANGEROUS: Brakes: Rear brake pads worn beyond limit");
  });

  it("never includes an engine-size line - MotHistoryDetails has no EngineCapacityCc to report", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateCarBuyingGuideBriefing(baseInput, "key");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].text).not.toContain("ENGINE:");
  });

  it("instructs the model to weigh structural corrosion, emissions/exhaust, and ABS/SRS categories above cosmetic wear", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateCarBuyingGuideBriefing(baseInput, "key");
    const systemPrompt = JSON.parse(fetchMock.mock.calls[0][1].body).systemInstruction.parts[0].text;
    expect(systemPrompt).toContain("structural corrosion");
    expect(systemPrompt).toContain("emissions/exhaust");
    expect(systemPrompt).toContain("ABS/SRS/airbag");
  });

  it("instructs the model to raise EV/hybrid due-diligence points only when the fuel type calls for it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateCarBuyingGuideBriefing(baseInput, "key");
    const systemPrompt = JSON.parse(fetchMock.mock.calls[0][1].body).systemInstruction.parts[0].text;
    expect(systemPrompt).toContain("battery state-of-health/degradation");
    expect(systemPrompt).toContain("charging cable");
    expect(systemPrompt).toContain("battery warranty terms");
    expect(systemPrompt).toContain("A petrol or diesel car needs none of this");
  });

  it("instructs the model not to recommend buying, same as the other narration modules", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateCarBuyingGuideBriefing(baseInput, "key");
    const systemPrompt = JSON.parse(fetchMock.mock.calls[0][1].body).systemInstruction.parts[0].text;
    expect(systemPrompt).toContain("Do not tell the reader whether to buy the car");
  });

  it("omits the VDI CHECK and VALUATION blocks entirely when neither was given (the plain, free lookup)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateCarBuyingGuideBriefing(baseInput, "key");
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).not.toContain("VDI CHECK");
    expect(prompt).not.toContain("VALUATION");
  });

  it("flags a stolen marker, write-off, and outstanding finance in the VDI CHECK block when present", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateCarBuyingGuideBriefing(
      {
        ...baseInput,
        vdiCheck: {
          isStolen: true, hasWriteOffRecord: true, writeOffRecordCount: 1, hasOutstandingFinance: true,
          financeRecords: [{ agreementDate: "2024-01-01", agreementType: "HP", financeCompany: "Example Finance" }],
          keeperChanges: [], keeperChangeCount: 1, plateChangeCount: 0, colourChangeCount: 0, currentColour: null,
          vedFirstYearTwelveMonths: null, vedStandardTwelveMonths: null, v5cReissueCount: 0,
          calculatedAverageAnnualMileage: null, averageMileageForAge: null, mileageAnomalyDetected: false,
          manufacturerWarrantyMiles: null, manufacturerWarrantyMonths: null,
        },
      },
      "key"
    );
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain("STOLEN MARKER: yes");
    expect(prompt).toContain("WRITE-OFF RECORD: yes, 1 record(s)");
    expect(prompt).toContain("OUTSTANDING FINANCE: yes, 1 agreement(s)");
  });

  it("includes the independent private-average valuation figure when given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateCarBuyingGuideBriefing(
      {
        ...baseInput,
        valuation: {
          valuationTime: null, valuationMileage: null, vehicleDescription: null, onTheRoad: null,
          dealerForecourt: null, tradeRetail: null, privateClean: null, privateAverage: 23994,
          partExchange: null, auction: null, tradeAverage: null, tradePoor: null,
        },
      },
      "key"
    );
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain("VALUATION (independent): private average £23,994");
  });

  it("instructs the model to lead with a VDI-sourced flag ahead of anything from the MOT history", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateCarBuyingGuideBriefing(baseInput, "key");
    const systemPrompt = JSON.parse(fetchMock.mock.calls[0][1].body).systemInstruction.parts[0].text;
    expect(systemPrompt).toContain("a stolen marker, write-off record, or outstanding finance is the single most important thing here");
  });
});
