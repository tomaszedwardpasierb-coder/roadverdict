import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ logGeminiUsage: vi.fn() }));
vi.mock("@/lib/tracker/geminiUsageLog", () => ({ logGeminiUsage: mocks.logGeminiUsage }));

import { generateVdiSummary, type VdiSummaryInput } from "@/lib/tracker/vdiSummaryProse";
import type { VdiCheckResult } from "@/lib/tracker/vdiUnlock";

function geminiResponse(bodyText: string) {
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: bodyText }] } }] }) };
}
function mockFetchReturning(bodyText: string) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(bodyText)));
}

const cleanVdiCheck: VdiCheckResult = {
  isStolen: false,
  hasWriteOffRecord: false,
  writeOffRecordCount: 0,
  hasOutstandingFinance: false,
  financeRecords: [],
  keeperChanges: [],
  keeperChangeCount: 1,
  plateChangeCount: 0,
  colourChangeCount: 0,
  currentColour: "SILVER",
  vedFirstYearTwelveMonths: null,
  vedStandardTwelveMonths: 200,
  v5cReissueCount: 0,
  calculatedAverageAnnualMileage: null,
  averageMileageForAge: null,
  mileageAnomalyDetected: false,
  manufacturerWarrantyMiles: null,
  manufacturerWarrantyMonths: null,
};

const validResult = { keyFindings: ["No stolen marker, write-off record, or outstanding finance found."], summary: "This vehicle's independent record is clean." };

const baseInput: VdiSummaryInput = {
  make: "Ford",
  model: "Focus",
  year: 2018,
  vdiCheck: cleanVdiCheck,
  verdictLabel: "Well documented",
  loggedKeeperChangeCount: 1,
};

describe("generateVdiSummary", () => {
  beforeEach(() => mocks.logGeminiUsage.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it("returns the parsed summary on a well-formed response", async () => {
    mockFetchReturning(JSON.stringify(validResult));
    expect(await generateVdiSummary(baseInput, "key")).toEqual({ ...validResult, valuationNote: null });
  });

  it("logs Gemini usage under the vdiSummary task on success", async () => {
    mockFetchReturning(JSON.stringify(validResult));
    await generateVdiSummary(baseInput, "key");
    expect(mocks.logGeminiUsage).toHaveBeenCalledWith("vdiSummary", expect.any(String), true);
  });

  it("fails soft to null on a non-ok HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    expect(await generateVdiSummary(baseInput, "key")).toBeNull();
  });

  it("fails soft to null when fetch itself throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    expect(await generateVdiSummary(baseInput, "key")).toBeNull();
  });

  it("fails soft to null when the model's own text isn't valid JSON", async () => {
    mockFetchReturning("not json");
    expect(await generateVdiSummary(baseInput, "key")).toBeNull();
  });

  it("fails soft to null when the parsed shape is missing the summary string", async () => {
    mockFetchReturning(JSON.stringify({ keyFindings: [] }));
    expect(await generateVdiSummary(baseInput, "key")).toBeNull();
  });

  it("filters non-string entries out of keyFindings", async () => {
    mockFetchReturning(JSON.stringify({ keyFindings: ["real", 1, null], summary: "x" }));
    expect(await generateVdiSummary(baseInput, "key")).toEqual({ keyFindings: ["real"], valuationNote: null, summary: "x" });
  });

  it("passes valuationNote through when the model includes it", async () => {
    mockFetchReturning(JSON.stringify({ ...validResult, valuationNote: "The asking price sits within the private-sale range." }));
    const result = await generateVdiSummary(baseInput, "key");
    expect(result?.valuationNote).toBe("The asking price sits within the private-sale range.");
  });

  it("puts a stolen marker in the facts block when present", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateVdiSummary({ ...baseInput, vdiCheck: { ...cleanVdiCheck, isStolen: true } }, "key");
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain("STOLEN MARKER: yes");
  });

  it("puts a write-off and outstanding finance flag in the facts block when present", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateVdiSummary(
      {
        ...baseInput,
        vdiCheck: {
          ...cleanVdiCheck,
          hasWriteOffRecord: true,
          writeOffRecordCount: 1,
          hasOutstandingFinance: true,
          financeRecords: [{ agreementDate: "2024-01-01", agreementType: "HIRE PURCHASE", financeCompany: "Example Finance" }],
        },
      },
      "key"
    );
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain("WRITE-OFF RECORD: yes, 1 record(s) on file");
    expect(prompt).toContain("OUTSTANDING FINANCE: yes, 1 agreement(s) on file (e.g. Example Finance, HIRE PURCHASE), agreement dated 1 Jan 2024");
  });

  it("flags a keeper-change discrepancy between the independent and logged figures in the facts block", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateVdiSummary({ ...baseInput, vdiCheck: { ...cleanVdiCheck, keeperChangeCount: 3 }, loggedKeeperChangeCount: 1 }, "key");
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain("Keeper changes on independent record: 3 (owner's own logged/DVLA figure: 1)");
  });

  it("includes the valuation block and asking price only when a valuation is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateVdiSummary(
      {
        ...baseInput,
        valuation: {
          valuationTime: null,
          valuationMileage: 23627,
          vehicleDescription: null,
          onTheRoad: 38015,
          dealerForecourt: 27161,
          tradeRetail: 26240,
          privateClean: 24257,
          privateAverage: 23994,
          partExchange: 23880,
          auction: 23866,
          tradeAverage: 23060,
          tradePoor: 21471,
        },
        askingPrice: 22000,
      },
      "key"
    );
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain("Private average: £23,994");
    expect(prompt).toContain("Seller's own asking price: £22,000");
  });

  it("omits the valuation block entirely when no valuation is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateVdiSummary(baseInput, "key");
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).not.toContain("VALUATION");
  });

  it("uses the newer systemInstruction field for the system prompt, not concatenated into contents", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateVdiSummary(baseInput, "key");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.systemInstruction.parts[0].text).toContain("Do NOT tell the reader whether to buy the vehicle");
    expect(body.contents[0].parts[0].text).not.toContain("Do NOT tell the reader");
  });

  it("omits the year from the facts block for a custom build with no manufacture year", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateVdiSummary({ ...baseInput, year: null }, "key");
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain("VEHICLE: Ford Focus");
  });

  it("lists keeper-change dates, most recent first, when given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateVdiSummary(
      {
        ...baseInput,
        vdiCheck: {
          ...cleanVdiCheck,
          keeperChangeCount: 3,
          keeperChanges: [
            { keeperStartDate: "2025-11-12T00:00:00Z", previousKeeperDisposalDate: null },
            { keeperStartDate: "2025-12-22T00:00:00Z", previousKeeperDisposalDate: "2025-12-22T00:00:00Z" },
            { keeperStartDate: "2026-06-03T00:00:00Z", previousKeeperDisposalDate: "2026-04-23T00:00:00Z" },
          ],
        },
      },
      "key"
    );
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain("Keeper change dates (most recent first)");
    const idxJune = prompt.indexOf("3 Jun 2026");
    const idxNov = prompt.indexOf("12 Nov 2025");
    expect(idxJune).toBeGreaterThan(-1);
    expect(idxNov).toBeGreaterThan(idxJune);
  });

  it("includes the independent mileage-vs-average-for-age comparison when given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateVdiSummary(
      { ...baseInput, vdiCheck: { ...cleanVdiCheck, calculatedAverageAnnualMileage: 1120, averageMileageForAge: 16000, mileageAnomalyDetected: false } },
      "key"
    );
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain("INDEPENDENT MILEAGE CHECK");
    expect(prompt).toContain("1,120 miles/year");
    expect(prompt).toContain("16,000 miles/year");
    expect(prompt).toContain("Anomaly flagged: no");
  });

  it("includes the manufacturer warranty window when given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateVdiSummary(
      { ...baseInput, vdiCheck: { ...cleanVdiCheck, manufacturerWarrantyMiles: 37282, manufacturerWarrantyMonths: 24 } },
      "key"
    );
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain("MANUFACTURER WARRANTY: 24 months / 37,282 miles from new");
  });

  it("instructs the model to name a rapid keeper-turnover pattern explicitly, and to check finance against the current keeper's start date", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateVdiSummary(baseInput, "key");
    const systemPrompt = JSON.parse(fetchMock.mock.calls[0][1].body).systemInstruction.parts[0].text;
    expect(systemPrompt).toContain("name that specific pattern explicitly");
    expect(systemPrompt).toContain("finance appears to be currently outstanding under this ownership");
  });
});
