import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ logGeminiUsage: vi.fn() }));
vi.mock("@/lib/tracker/geminiUsageLog", () => ({ logGeminiUsage: mocks.logGeminiUsage }));

import { generateBuyingGuideBriefing, type BuyingGuideBriefingInput } from "@/lib/tracker/buyingGuideBriefing";

function geminiResponse(bodyText: string) {
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: bodyText }] } }] }) };
}

const validResult = { motFlags: [], modelNotes: ["Known regulator/rectifier weak point on this generation."], summary: "A clean history overall." };

const baseInput: BuyingGuideBriefingInput = {
  make: "Yamaha",
  model: "MT-07",
  year: 2018,
  engineCapacityCc: 689,
  motTests: [],
};

describe("generateBuyingGuideBriefing", () => {
  beforeEach(() => mocks.logGeminiUsage.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it("returns the parsed briefing on a well-formed response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult))));
    expect(await generateBuyingGuideBriefing(baseInput, "key")).toEqual(validResult);
  });

  it("logs Gemini usage under the buyingGuideBriefing task on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult))));
    await generateBuyingGuideBriefing(baseInput, "key");
    expect(mocks.logGeminiUsage).toHaveBeenCalledWith("buyingGuideBriefing", expect.any(String), true);
  });

  it("fails soft to null on a non-ok HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    expect(await generateBuyingGuideBriefing(baseInput, "key")).toBeNull();
  });

  it("fails soft to null when fetch itself throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    expect(await generateBuyingGuideBriefing(baseInput, "key")).toBeNull();
  });

  it("fails soft to null when the model's own text isn't valid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse("not json")));
    expect(await generateBuyingGuideBriefing(baseInput, "key")).toBeNull();
  });

  it("fails soft to null when the parsed shape is missing the summary string", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({ motFlags: [], modelNotes: [] }))));
    expect(await generateBuyingGuideBriefing(baseInput, "key")).toBeNull();
  });

  it("filters non-string entries out of motFlags and modelNotes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({
      motFlags: ["real", 1], modelNotes: [null, "also real"], summary: "x",
    }))));
    expect(await generateBuyingGuideBriefing(baseInput, "key")).toEqual({
      motFlags: ["real"], modelNotes: ["also real"], summary: "x",
    });
  });

  it("states plainly when there's no MOT history on record, rather than an empty section", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateBuyingGuideBriefing(baseInput, "key"); // motTests: []
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain("No MOT test history on record for this registration.");
  });

  it("lists real MOT tests oldest-to-newest with date, result, mileage, and notes", async () => {
    const input: BuyingGuideBriefingInput = {
      ...baseInput,
      motTests: [
        { testDate: "2023-05-01", passed: true, mileage: 12000, notes: "" },
        { testDate: "2024-05-01", passed: false, mileage: 14500, notes: "Rear brake pads worn" },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);

    await generateBuyingGuideBriefing(input, "key");

    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain("1 May 2023 - Passed - 12,000 miles");
    expect(prompt).toContain("1 May 2024 - Failed - 14,500 miles - Rear brake pads worn");
  });

  it("omits the engine line when engineCapacityCc is null", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateBuyingGuideBriefing({ ...baseInput, engineCapacityCc: null }, "key");
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).not.toContain("ENGINE:");
  });

  // The specific, deliberate asymmetry this module's prompt draws:
  // MOT-related points must trace to a real recorded test, but model
  // knowledge is explicitly ALLOWED to draw on general training data
  // about known faults for this make/model, since the MOT facts don't
  // cover that at all - the opposite instruction from every other AI
  // module tested so far.
  it("explicitly permits model-knowledge notes to draw on general training data, unlike every other fact category", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateBuyingGuideBriefing(baseInput, "key");
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain("may draw on your own training knowledge of this make and model");
    expect(prompt).toContain("never assume a fault exists unless it is actually recorded");
  });

  it("instructs the model not to recommend buying, same as the other two narration modules", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateBuyingGuideBriefing(baseInput, "key");
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain("Do not tell the reader whether to buy the bike");
  });

  it("omits the VDI CHECK facts block entirely when no vdiCheck was given (the plain, free lookup)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateBuyingGuideBriefing(baseInput, "key");
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).not.toContain("VDI CHECK (independent");
  });

  it("includes a clean VDI CHECK block when vdiCheck is given and everything comes back clean", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateBuyingGuideBriefing(
      {
        ...baseInput,
        vdiCheck: {
          isStolen: false, hasWriteOffRecord: false, writeOffRecordCount: 0, hasOutstandingFinance: false, financeRecords: [],
          keeperChangeCount: 1, plateChangeCount: 0, colourChangeCount: 0, currentColour: null,
          vedFirstYearTwelveMonths: null, vedStandardTwelveMonths: null,
        },
      },
      "key"
    );
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain("Stolen marker: none");
    expect(prompt).toContain("Write-off record: none");
    expect(prompt).toContain("Outstanding finance: none found");
  });

  it("flags a stolen marker, write-off, and outstanding finance in the VDI CHECK block when present", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateBuyingGuideBriefing(
      {
        ...baseInput,
        vdiCheck: {
          isStolen: true, hasWriteOffRecord: true, writeOffRecordCount: 2, hasOutstandingFinance: true,
          financeRecords: [{ agreementDate: "2024-01-01", agreementType: "HP", financeCompany: "Example Finance" }],
          keeperChangeCount: 1, plateChangeCount: 0, colourChangeCount: 0, currentColour: null,
          vedFirstYearTwelveMonths: null, vedStandardTwelveMonths: null,
        },
      },
      "key"
    );
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain("STOLEN MARKER: yes");
    expect(prompt).toContain("WRITE-OFF RECORD: yes, 2 record(s)");
    expect(prompt).toContain("OUTSTANDING FINANCE: yes, 1 agreement(s)");
  });

  it("instructs the model to lead with a VDI-sourced flag ahead of anything from the MOT history", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateBuyingGuideBriefing(baseInput, "key");
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain("a stolen marker, write-off record, or outstanding finance is the single most important thing here");
  });
});