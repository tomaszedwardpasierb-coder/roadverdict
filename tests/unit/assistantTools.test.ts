import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPrimaryBike: vi.fn(),
  getServiceRecords: vi.fn(),
  getMods: vi.fn(),
  getBills: vi.fn(),
  getFuelLogs: vi.fn(),
  getReminders: vi.fn(),
  computeReminderStatus: vi.fn(),
  reminderDetailLabel: vi.fn(),
  computeActualMPG: vi.fn(),
  computeMPGSeries: vi.fn(),
  gatherMileagePoints: vi.fn(),
  getShareLinksForUser: vi.fn(),
  getPendingReceiptRequestsForOwner: vi.fn(),
  getSellerReportData: vi.fn(),
  buildBikeComparison: vi.fn(),
}));

vi.mock("@/lib/tracker/bike", () => ({ getPrimaryBike: mocks.getPrimaryBike }));
vi.mock("@/lib/tracker/serviceRecord", () => ({ getServiceRecords: mocks.getServiceRecords }));
vi.mock("@/lib/tracker/mod", () => ({ getMods: mocks.getMods }));
vi.mock("@/lib/tracker/bill", () => ({ getBills: mocks.getBills }));
vi.mock("@/lib/tracker/fuelLog", () => ({ getFuelLogs: mocks.getFuelLogs }));
vi.mock("@/lib/tracker/reminder", () => ({ getReminders: mocks.getReminders }));
vi.mock("@/lib/tracker/reminderStatus", () => ({
  computeReminderStatus: mocks.computeReminderStatus,
  reminderDetailLabel: mocks.reminderDetailLabel,
}));
vi.mock("@/lib/tracker/mpgCalc", () => ({
  computeActualMPG: mocks.computeActualMPG,
  computeMPGSeries: mocks.computeMPGSeries,
}));
vi.mock("@/lib/tracker/summary", () => ({ gatherMileagePoints: mocks.gatherMileagePoints }));
vi.mock("@/lib/tracker/shareLink", () => ({ getShareLinksForUser: mocks.getShareLinksForUser }));
vi.mock("@/lib/tracker/receiptRequest", () => ({ getPendingReceiptRequestsForOwner: mocks.getPendingReceiptRequestsForOwner }));
vi.mock("@/lib/tracker/sellerReportData", () => ({ getSellerReportData: mocks.getSellerReportData }));
vi.mock("@/lib/tracker/bikeComparison", () => ({ buildBikeComparison: mocks.buildBikeComparison }));
// jobTypes.ts (JOB_LABELS) is deliberately NOT mocked - pure static data.
// bikeComparisonVerdict.ts (buildCostPerMileVerdict) is deliberately NOT
// mocked either - it's pure, no I/O, so this exercises the real
// "which bike is cheapest" logic rather than a stand-in for it.

import {
  runAssistantTool,
  toolGetSpendTotal,
  toolGetMileage,
  toolGetMpgTrend,
  toolGetReminders,
  toolGetBudgetProgress,
  toolGetLastLoggedJob,
  toolGetShareLinks,
  toolGetStorySoFar,
  toolGetViewedReport,
  toolGetViewedComparison,
  toolProposeLogEntry,
  ASSISTANT_TOOL_DECLARATIONS,
} from "@/lib/tracker/assistantTools";

const bike = { id: "bike-1", currentMileage: 15000, currency: "GBP", annualBudget: null as number | null };

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getPrimaryBike.mockResolvedValue(bike);
  mocks.getServiceRecords.mockResolvedValue([]);
  mocks.getMods.mockResolvedValue([]);
  mocks.getBills.mockResolvedValue([]);
  mocks.getFuelLogs.mockResolvedValue([]);
  mocks.getReminders.mockResolvedValue([]);
  mocks.getShareLinksForUser.mockResolvedValue([]);
  mocks.getPendingReceiptRequestsForOwner.mockResolvedValue([]);
});

describe("runAssistantTool - the core security dispatch layer", () => {
  it("every tool declared in ASSISTANT_TOOL_DECLARATIONS actually dispatches, none silently fall through to 'unknown tool'", async () => {
    mocks.computeActualMPG.mockReturnValue(null); // so getMpgTrend takes its real "not enough data" branch, not undefined.filter()
    for (const tool of ASSISTANT_TOOL_DECLARATIONS) {
      const result: any = await runAssistantTool(tool.name, { jobQuery: "oil" }, "owner@example.com");
      if (result?.error) expect(result.error).not.toMatch(/^Unknown tool/);
    }
  });

  it("returns a generic error for a genuinely unknown tool name, rather than throwing", async () => {
    const result: any = await runAssistantTool("deleteEverything", {}, "owner@example.com");
    expect(result).toEqual({ error: "Unknown tool: deleteEverything" });
  });

  // The entire stated purpose of this file: no session-scoped tool ever
  // reads which account to act on from the model-supplied args - only
  // the separately-passed, server-derived email parameter.
  it("uses only the server-derived email parameter, ignoring any account identifier the model-supplied args might contain", async () => {
    await runAssistantTool("getSpendTotal", { email: "attacker@example.com", userId: "someone-else" } as any, "real-owner@example.com");
    expect(mocks.getPrimaryBike).toHaveBeenCalledWith("real-owner@example.com");
  });

  it("getViewedReport refuses to run at all when no report token was independently verified by the caller", async () => {
    const result: any = await runAssistantTool("getViewedReport", {}, "owner@example.com");
    expect(result).toEqual({ error: "No report is currently open." });
    expect(mocks.getSellerReportData).not.toHaveBeenCalled();
  });

  // Same "never trust model-supplied identity" principle, applied to
  // the token-based tool: even if args somehow carried a token, only
  // the separate, server-verified reportToken parameter is ever used.
  it("getViewedReport uses only the server-verified reportToken parameter, never one from args", async () => {
    mocks.getSellerReportData.mockResolvedValue({
      bike: { isCustomBuild: false, year: 2018, make: "Yamaha", model: "MT-07", currentMileage: 15000 },
      askingPrice: null, verdict: { label: "x", reasons: [] }, storyParagraphs: [],
      evidenceQuality: { totalRecords: 1, receiptCoveragePct: 1, realTimePct: 1, mileageInternallyConsistent: true },
      upcomingCostItems: [],
    });

    await runAssistantTool("getViewedReport", { shareToken: "attacker-supplied-token" } as any, "", "real-verified-token");

    expect(mocks.getSellerReportData).toHaveBeenCalledWith("real-verified-token");
  });

  it("getViewedComparison refuses to run at all when no compareContext was independently verified by the caller", async () => {
    const result: any = await runAssistantTool("getViewedComparison", {}, "owner@example.com");
    expect(result).toEqual({ error: "No comparison is currently open." });
    expect(mocks.buildBikeComparison).not.toHaveBeenCalled();
  });

  // Same "never trust model-supplied identity" principle as
  // getViewedReport above - even if args somehow carried bike ids, only
  // the separate, server-verified compareContext parameter is ever used.
  it("getViewedComparison uses only the server-verified compareContext parameter, never one from args", async () => {
    mocks.buildBikeComparison.mockResolvedValue([]);

    await runAssistantTool(
      "getViewedComparison",
      { bikeIds: ["attacker-supplied-id"] } as any,
      "real-owner@example.com",
      undefined,
      { bikeIds: ["real-bike-1", "real-bike-2"] }
    );

    expect(mocks.buildBikeComparison).toHaveBeenCalledWith("real-owner@example.com", ["real-bike-1", "real-bike-2"], undefined);
  });
});

describe("toolGetViewedComparison", () => {
  const bikeA = { bikeId: "b-1", name: "Africa Twin", costPerMile: 0.1, spend: { grandTotal: 500 }, milesRidden: 5000, actualMpg: 55, serviceCount: 3, documentationPct: 80, nextDue: null };
  const bikeB = { bikeId: "b-2", name: "Tiger 900", costPerMile: 0.2, spend: { grandTotal: 800 }, milesRidden: 4000, actualMpg: 45, serviceCount: 2, documentationPct: 60, nextDue: { name: "MOT", status: "due-soon" } };

  it("returns an error when fewer than two bikes could be loaded", async () => {
    mocks.buildBikeComparison.mockResolvedValue([bikeA]);
    const result = await toolGetViewedComparison("owner@example.com", { bikeIds: ["b-1", "b-2"] });
    expect(result).toEqual({ error: "Couldn't load this comparison right now." });
  });

  it("returns the computed cheapest-to-run verdict alongside each bike's own figures", async () => {
    mocks.buildBikeComparison.mockResolvedValue([bikeA, bikeB]);
    const result: any = await toolGetViewedComparison("owner@example.com", { bikeIds: ["b-1", "b-2"] });

    expect(result.period).toBe("overall");
    expect(result.cheapestToRunVerdict).toContain("Africa Twin");
    expect(result.bikes).toEqual([
      { name: "Africa Twin", costPerMile: 0.1, totalSpend: 500, milesRidden: 5000, actualMpg: 55, servicesLogged: 3, documentationCoveragePct: 80, dueSoonest: null },
      { name: "Tiger 900", costPerMile: 0.2, totalSpend: 800, milesRidden: 4000, actualMpg: 45, servicesLogged: 2, documentationCoveragePct: 60, dueSoonest: { name: "MOT", status: "due-soon" } },
    ]);
  });

  it("passes a from/to period through to buildBikeComparison and reports it back, rather than always 'overall'", async () => {
    mocks.buildBikeComparison.mockResolvedValue([bikeA, bikeB]);
    await toolGetViewedComparison("owner@example.com", { bikeIds: ["b-1", "b-2"], from: "2025-01-01" });
    expect(mocks.buildBikeComparison).toHaveBeenCalledWith("owner@example.com", ["b-1", "b-2"], { from: "2025-01-01", to: undefined });

    const result: any = await toolGetViewedComparison("owner@example.com", { bikeIds: ["b-1", "b-2"], from: "2025-01-01" });
    expect(result.period).toEqual({ from: "2025-01-01", to: null });
  });

  it("fails safely with a plain tool error, never an unhandled throw, if the underlying lookup rejects", async () => {
    mocks.buildBikeComparison.mockRejectedValue(new Error("Cosmos unavailable"));
    const result = await toolGetViewedComparison("owner@example.com", { bikeIds: ["b-1", "b-2"] });
    expect(result).toEqual({ error: "Couldn't load this comparison right now." });
  });
});

describe("toolGetSpendTotal", () => {
  it("returns an error when the account has no bike", async () => {
    mocks.getPrimaryBike.mockResolvedValue(null);
    expect(await toolGetSpendTotal("owner@example.com", {})).toEqual({ error: "No bike found on this account." });
  });

  it("totals across all categories when none is specified", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ date: "2025-01-01", cost: 100 }]);
    mocks.getFuelLogs.mockResolvedValue([{ date: "2025-01-01", cost: 50 }]);
    const result: any = await toolGetSpendTotal("owner@example.com", {});
    expect(result.total).toBe(150);
    expect(result.category).toBe("all");
  });

  it("filters to a single category when specified", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ date: "2025-01-01", cost: 100 }]);
    mocks.getFuelLogs.mockResolvedValue([{ date: "2025-01-01", cost: 50 }]);
    const result: any = await toolGetSpendTotal("owner@example.com", { category: "fuel" });
    expect(result.total).toBe(50);
  });

  it("filters by an inclusive date range", async () => {
    mocks.getServiceRecords.mockResolvedValue([
      { date: "2024-06-01", cost: 100 }, // before range
      { date: "2025-06-01", cost: 50 },  // in range
    ]);
    const result: any = await toolGetSpendTotal("owner@example.com", { startDate: "2025-01-01", endDate: "2025-12-31" });
    expect(result.total).toBe(50);
    expect(result.entryCount).toBe(1);
  });
});

describe("toolGetMileage", () => {
  it("returns current mileage when no date is asked about", async () => {
    const result: any = await toolGetMileage("owner@example.com", {});
    expect(result).toEqual({ mileage: 15000, asOf: "current" });
  });

  // An honest, labelled approximation, never a fabricated exact figure
  // for a date nothing was actually logged on.
  it("picks the closest logged point to the requested date and labels it as an approximation", async () => {
    mocks.gatherMileagePoints.mockReturnValue([
      { date: "2025-01-01", mileage: 10000 },
      { date: "2025-06-01", mileage: 13000 },
    ]);
    const result: any = await toolGetMileage("owner@example.com", { atDate: "2025-05-20" });
    expect(result.mileage).toBe(13000);
    expect(result.asOf).toBe("2025-06-01");
    expect(result.note).toContain("Closest logged reading");
  });

  it("returns an error when no mileage history is logged at all", async () => {
    mocks.gatherMileagePoints.mockReturnValue([]);
    expect(await toolGetMileage("owner@example.com", { atDate: "2025-01-01" })).toEqual({ error: "No mileage history logged yet." });
  });
});

describe("toolGetMpgTrend", () => {
  it("reports insufficient data plainly rather than a partial or fabricated figure", async () => {
    mocks.computeActualMPG.mockReturnValue(null);
    expect(await toolGetMpgTrend("owner@example.com")).toEqual({
      hasEnoughData: false,
      reason: "Needs at least two consecutive full-tank fill-ups logged.",
    });
  });

  it("reports recent fill-ups trending above the overall average", async () => {
    mocks.computeActualMPG.mockReturnValue(50);
    mocks.computeMPGSeries.mockReturnValue([{ mpg: 55, exclusionReason: undefined }]);
    const result: any = await toolGetMpgTrend("owner@example.com");
    expect(result.trend).toBe("recent fill-ups above average");
  });

  it("reports steady when the most recent fill-up excludes to nothing usable", async () => {
    mocks.computeActualMPG.mockReturnValue(50);
    mocks.computeMPGSeries.mockReturnValue([{ mpg: 999, exclusionReason: "anomaly" }]);
    const result: any = await toolGetMpgTrend("owner@example.com");
    expect(result.trend).toBe("steady");
    expect(result.mostRecentFillUpMpg).toBeUndefined();
  });
});

describe("toolGetReminders", () => {
  // The explicit, documented correctness fix: a tool scoped to only
  // "needs attention" cannot honestly answer "when is my next MOT due"
  // for something scheduled normally in the future - every reminder
  // must come back, not just overdue/due-soon ones.
  it("returns every reminder including ones that are neither overdue nor due soon", async () => {
    mocks.getReminders.mockResolvedValue([{ name: "MOT" }, { name: "Oil change" }]);
    mocks.computeReminderStatus.mockReturnValueOnce("ok").mockReturnValueOnce("overdue");
    mocks.reminderDetailLabel.mockReturnValue("due 1 Jun 2026");

    const result: any = await toolGetReminders("owner@example.com");

    expect(result.upcoming).toHaveLength(1);
    expect(result.upcoming[0].name).toBe("MOT");
    expect(result.overdue).toHaveLength(1);
  });
});

describe("toolGetBudgetProgress", () => {
  it("reports no budget when none is set, without attempting to compute spend", async () => {
    mocks.getPrimaryBike.mockResolvedValue({ ...bike, annualBudget: null });
    expect(await toolGetBudgetProgress("owner@example.com")).toEqual({ hasBudget: false });
    expect(mocks.getServiceRecords).not.toHaveBeenCalled();
  });

  it("only counts spend from the current calendar year toward budget progress", async () => {
    mocks.getPrimaryBike.mockResolvedValue({ ...bike, annualBudget: 1000 });
    mocks.getServiceRecords.mockResolvedValue([
      { date: "2020-01-01", cost: 500 }, // a past year, must not count
      { date: `${new Date().getFullYear()}-01-01`, cost: 200 },
    ]);
    const result: any = await toolGetBudgetProgress("owner@example.com");
    expect(result.spentThisYear).toBe(200);
    expect(result.remaining).toBe(800);
  });
});

describe("toolGetLastLoggedJob", () => {
  // The exact historical bug the source comment references: jobQuery is
  // declared "required" in the tool schema, but that's a hint to the
  // model, not a runtime guarantee - trusting it unchecked previously
  // caused a real build failure.
  it("handles a missing or non-string jobQuery gracefully, rather than trusting the declared schema", async () => {
    expect(await toolGetLastLoggedJob("owner@example.com", {})).toEqual({ error: "No job type specified." });
    expect(await toolGetLastLoggedJob("owner@example.com", { jobQuery: 42 })).toEqual({ error: "No job type specified." });
  });

  it("returns not-found when there are no service records at all", async () => {
    expect(await toolGetLastLoggedJob("owner@example.com", { jobQuery: "oil" })).toEqual({ found: false });
  });

  it("matches by substring against the job label, case-insensitively", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ jobType: "oil-filter", date: "2025-01-01", mileage: 5000, cost: 40 }]);
    const result: any = await toolGetLastLoggedJob("owner@example.com", { jobQuery: "OIL" });
    expect(result.found).toBe(true);
  });

  it("picks the most recent matching record when several exist", async () => {
    mocks.getServiceRecords.mockResolvedValue([
      { jobType: "oil-filter", date: "2024-01-01", mileage: 4000, cost: 40 },
      { jobType: "oil-filter", date: "2025-06-01", mileage: 8000, cost: 45 },
    ]);
    const result: any = await toolGetLastLoggedJob("owner@example.com", { jobQuery: "oil" });
    expect(result.date).toBe("2025-06-01");
  });
});

describe("toolGetShareLinks", () => {
  it("filters links down to the primary bike only, ignoring links for any other bike on the account", async () => {
    mocks.getShareLinksForUser.mockResolvedValue([
      { bikeId: "bike-1", recipientEmail: "buyer@example.com", createdAt: "2025-01-01" },
      { bikeId: "some-other-bike", recipientEmail: "x@example.com", createdAt: "2025-01-01" },
    ]);
    const result: any = await toolGetShareLinks("owner@example.com");
    expect(result.activeLinkCount).toBe(1);
  });

  it("excludes an expired link from the active count", async () => {
    mocks.getShareLinksForUser.mockResolvedValue([
      { bikeId: "bike-1", recipientEmail: "buyer@example.com", createdAt: "2025-01-01", expiresAt: "2020-01-01" },
    ]);
    const result: any = await toolGetShareLinks("owner@example.com");
    expect(result.hasActiveLinks).toBe(false);
  });

  it("still reports the pending receipt-request count even when there are no active links", async () => {
    mocks.getPendingReceiptRequestsForOwner.mockResolvedValue([{ bikeId: "bike-1" }]);
    const result: any = await toolGetShareLinks("owner@example.com");
    expect(result).toEqual({ hasActiveLinks: false, pendingReceiptRequestCount: 1 });
  });
});

describe("toolGetStorySoFar", () => {
  it("gives clear guidance when no story has been generated yet, rather than an empty result", async () => {
    mocks.getPrimaryBike.mockResolvedValue({ ...bike, storyCache: undefined });
    const result: any = await toolGetStorySoFar("owner@example.com");
    expect(result.hasStory).toBe(false);
    expect(result.note).toContain("click Generate my story");
  });

  it("returns the cached story when one exists", async () => {
    mocks.getPrimaryBike.mockResolvedValue({
      ...bike,
      storyCache: {
        generatedAt: "2025-06-01",
        response: { verdict: { label: "Well documented", reasons: [] }, sharedStory: ["A good bike."], ownerNotes: ["Log more receipts."] },
      },
    });
    const result: any = await toolGetStorySoFar("owner@example.com");
    expect(result).toMatchObject({ hasStory: true, story: ["A good bike."], ownerOnlyNotes: ["Log more receipts."] });
  });
});

describe("toolGetViewedReport", () => {
  const reportData = {
    bike: { isCustomBuild: false, year: 2018, make: "Yamaha", model: "MT-07", currentMileage: 15000, buyerOpinionCache: null as any },
    askingPrice: 4500,
    verdict: { label: "Well documented", reasons: ["Consistent history"] },
    storyParagraphs: ["A well-kept bike."],
    evidenceQuality: { totalRecords: 10, receiptCoveragePct: 80, realTimePct: 90, mileageInternallyConsistent: true },
    upcomingCostItems: [{ label: "Full service", timing: "due-soon", timingDetail: "due soon" }],
  };

  it("returns a summary shape without an honest read when none has been cached", async () => {
    mocks.getSellerReportData.mockResolvedValue(reportData);
    const result: any = await toolGetViewedReport("tok-1");
    expect(result.bike).toBe("2018 Yamaha MT-07");
    expect(result.honestRead).toBeUndefined();
  });

  it("includes the cached honest read when one exists, never triggering a fresh generation", async () => {
    mocks.getSellerReportData.mockResolvedValue({
      ...reportData,
      bike: { ...reportData.bike, buyerOpinionCache: { response: { honestRead: "Reads clean.", strengths: ["x"], concerns: [] } } },
    });
    const result: any = await toolGetViewedReport("tok-1");
    expect(result.honestRead).toBe("Reads clean.");
  });

  it("fails soft with a plain tool error if the report stops resolving, rather than an unhandled throw", async () => {
    mocks.getSellerReportData.mockRejectedValue(new Error("token expired between check and use"));
    expect(await toolGetViewedReport("tok-1")).toEqual({ error: "Couldn't load this report right now." });
  });
});

describe("toolProposeLogEntry", () => {
  it("returns an error when the account has no bike", async () => {
    mocks.getPrimaryBike.mockResolvedValue(null);
    const result = await toolProposeLogEntry("owner@example.com", { category: "service", description: "Oil", cost: 20 });
    expect(result).toEqual({ error: "No bike found on this account." });
  });

  it("rejects a missing or unsupported category, e.g. fuel or mods", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", { category: "fuel", description: "Petrol", cost: 20 } as any);
    expect(result.error).toMatch(/service record or a bill/);
  });

  it("rejects a missing description", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", { category: "service", cost: 20 });
    expect(result.error).toMatch(/description/i);
  });

  it("rejects a blank/whitespace-only description", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", { category: "service", description: "   ", cost: 20 });
    expect(result.error).toMatch(/description/i);
  });

  it("rejects a missing, non-numeric, or non-positive cost", async () => {
    expect((await toolProposeLogEntry("owner@example.com", { category: "service", description: "Oil" }) as any).error).toMatch(/cost/i);
    expect((await toolProposeLogEntry("owner@example.com", { category: "service", description: "Oil", cost: 0 }) as any).error).toMatch(/cost/i);
    expect((await toolProposeLogEntry("owner@example.com", { category: "service", description: "Oil", cost: -5 }) as any).error).toMatch(/cost/i);
    expect((await toolProposeLogEntry("owner@example.com", { category: "service", description: "Oil", cost: NaN }) as any).error).toMatch(/cost/i);
  });

  it("rejects a date in the future rather than logging something that hasn't happened yet", async () => {
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const result: any = await toolProposeLogEntry("owner@example.com", { category: "service", description: "Oil", cost: 20, date: tomorrow });
    expect(result.error).toMatch(/future/);
  });

  it("defaults to today's date when none is given or the given one is unparseable", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const result: any = await toolProposeLogEntry("owner@example.com", { category: "service", description: "Oil", cost: 20 });
    expect(result.date).toBe(today);

    const result2: any = await toolProposeLogEntry("owner@example.com", { category: "service", description: "Oil", cost: 20, date: "not-a-date" });
    expect(result2.date).toBe(today);
  });

  it("drafts a service entry with the recognized jobType and the account's current mileage", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", {
      category: "service", description: "Valve cleaner", cost: 4, date: "2026-01-01", jobType: "oil-filter",
    });
    expect(result).toEqual({
      category: "service", jobType: "oil-filter", jobLabel: expect.any(String),
      description: "Valve cleaner", cost: 4, date: "2026-01-01", mileage: 15000,
    });
  });

  it("defaults an unrecognized or missing jobType to 'other' rather than rejecting the draft", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", { category: "service", description: "Valve cleaner", cost: 4, jobType: "not-a-real-job" });
    expect(result.jobType).toBe("other");

    const result2: any = await toolProposeLogEntry("owner@example.com", { category: "service", description: "Valve cleaner", cost: 4 });
    expect(result2.jobType).toBe("other");
  });

  it("drafts a bill entry with a valid billType", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", {
      category: "bill", description: "Annual renewal", cost: 300, date: "2026-01-01", billType: "insurance",
    });
    expect(result).toEqual({ category: "bill", billType: "insurance", billLabel: expect.any(String), description: "Annual renewal", cost: 300, date: "2026-01-01" });
  });

  it("asks a clarifying question rather than guessing when billType is missing or invalid, since bills have no safe 'other' fallback", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", { category: "bill", description: "Annual renewal", cost: 300 });
    expect(result.error).toMatch(/insurance, road tax, MOT test, or finance/);

    const result2: any = await toolProposeLogEntry("owner@example.com", { category: "bill", description: "Annual renewal", cost: 300, billType: "not-real" });
    expect(result2.error).toMatch(/insurance, road tax, MOT test, or finance/);
  });
});