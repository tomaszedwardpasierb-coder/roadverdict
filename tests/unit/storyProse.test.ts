import { afterEach, describe, expect, it, vi } from "vitest";
import { generateStoryProse, type StoryProseInput } from "@/lib/tracker/storyProse";

function geminiResponse(bodyText: string) {
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: bodyText }] } }] }) };
}

const validResult = { sharedStory: ["A well-kept bike."], ownerNotes: [] };

const baseInput: StoryProseInput = {
  identity: {
    year: 2018, make: "Yamaha", model: "MT-07", currentMileage: 15000,
    loggedSinceDate: "2020-01-01", loggedSpanYears: 5, totalLoggedEvents: 20,
  } as any,
  categorySpend: [
    { category: "Servicing", total: 500, count: 3 },
    { category: "Tyres", total: 0, count: 0 }, // zero count - must be excluded
  ] as any,
  serviceRhythm: { serviceCount: 3, averageGapDays: null, longestGapDays: null, longestGapStartDate: null, longestGapEndDate: null } as any,
  mpgTrend: { hasEnoughData: false, overallAverageMpg: null, recentAverageMpg: null, recentSegmentCount: 0, anomalyCount: 0 } as any,
  verdict: { label: "Well documented", reasons: ["Consistent service history"] } as any,
  unconfirmedFindings: [],
  upcomingReminders: [],
};

describe("generateStoryProse", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the parsed story on a well-formed response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult))));
    expect(await generateStoryProse(baseInput, "key")).toEqual(validResult);
  });

  it("fails soft to null on a non-ok HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    expect(await generateStoryProse(baseInput, "key")).toBeNull();
  });

  it("fails soft to null when fetch itself throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    expect(await generateStoryProse(baseInput, "key")).toBeNull();
  });

  it("fails soft to null when the model's own text isn't valid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse("not json")));
    expect(await generateStoryProse(baseInput, "key")).toBeNull();
  });

  it("fails soft to null when the parsed shape is missing a required array", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({ sharedStory: ["x"] })))); // missing ownerNotes
    expect(await generateStoryProse(baseInput, "key")).toBeNull();
  });

  it("filters non-string entries out of both arrays", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      geminiResponse(JSON.stringify({ sharedStory: ["real", 1], ownerNotes: [null, "also real"] }))
    ));
    expect(await generateStoryProse(baseInput, "key")).toEqual({ sharedStory: ["real"], ownerNotes: ["also real"] });
  });

  it("excludes a zero-count category from the spend-by-category facts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateStoryProse(baseInput, "key");
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain("Servicing: £500.00 across 3 entries");
    expect(prompt).not.toContain("Tyres:");
  });

  it("omits the fuel-efficiency numbers when there isn't enough data, with an explicit note instead", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateStoryProse(baseInput, "key");
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain("Not enough fuel history logged yet");
  });

  it("includes fuel-efficiency numbers, including the anomaly-exclusion note, when there is enough data", async () => {
    const input = {
      ...baseInput,
      mpgTrend: { hasEnoughData: true, overallAverageMpg: 55.2, recentAverageMpg: 58.1, recentSegmentCount: 5, anomalyCount: 1 } as any,
    };
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateStoryProse(input, "key");
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain("Overall average: 55.2 mpg");
    expect(prompt).toContain("1 fill-up excluded as a known anomaly");
  });

  // The explicit content-scoping guardrail this module states: these
  // facts are for the owner only and must never reach a buyer's copy -
  // worth confirming the label itself, and that the section is
  // genuinely absent when there's nothing to strengthen.
  it("labels unconfirmed-findings facts as owner-only, never shown to a buyer, and omits the section entirely when there are none", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateStoryProse(baseInput, "key"); // unconfirmedFindings: []
    const emptyPrompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    // The system prompt's own instructions always reference this phrase
    // by name (telling the model what ownerNotes should be based on),
    // so check for the facts-block-only parenthetical specifically,
    // not the bare phrase which is never absent from the prompt overall.
    expect(emptyPrompt).not.toContain("for the owner only - never shown to a buyer");

    fetchMock.mockClear();
    await generateStoryProse({ ...baseInput, unconfirmedFindings: ["Pre-2020 service history"] }, "key");
    const filledPrompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(filledPrompt).toContain("for the owner only - never shown to a buyer");
    expect(filledPrompt).toContain("Pre-2020 service history");
  });

  it("instructs the model never to judge the owner as a person, only the bike", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validResult)));
    vi.stubGlobal("fetch", fetchMock);
    await generateStoryProse(baseInput, "key");
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain("Never make any claim about the OWNER as a person");
  });
});