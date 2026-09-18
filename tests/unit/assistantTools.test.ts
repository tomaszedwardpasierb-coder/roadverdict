import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveActiveVehicle: vi.fn(),
  resolveAllActiveVehicles: vi.fn(),
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
  getCarShareLinksForUser: vi.fn(),
  getPendingCarReceiptRequestsForOwner: vi.fn(),
  getSellerReportData: vi.fn(),
  buildBikeComparison: vi.fn(),
  buildCarComparison: vi.fn(),
  getCarServiceRecords: vi.fn(),
  getCarMods: vi.fn(),
  getCarBills: vi.fn(),
  getCarFuelLogs: vi.fn(),
  getCarReminders: vi.fn(),
  computeCarReminderStatus: vi.fn(),
  carReminderDetailLabel: vi.fn(),
  gatherCarMileagePoints: vi.fn(),
  getLabour: vi.fn(),
  getCarLabour: vi.fn(),
  getFines: vi.fn(),
  getCarFines: vi.fn(),
  getTolls: vi.fn(),
  getCarTolls: vi.fn(),
}));

// resolveActiveVehicle (activeVehicle.ts) is the one boundary every tool
// below actually calls now - mocked directly here rather than mocking
// the bike.ts/car.ts/next-headers functions it's built on internally,
// same "mock at the boundary the code under test directly calls"
// convention used throughout this suite.
vi.mock("@/lib/tracker/activeVehicle", () => ({ resolveActiveVehicle: mocks.resolveActiveVehicle, resolveAllActiveVehicles: mocks.resolveAllActiveVehicles }));
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
vi.mock("@/lib/tracker/carShareLink", () => ({ getCarShareLinksForUser: mocks.getCarShareLinksForUser }));
vi.mock("@/lib/tracker/carReceiptRequest", () => ({ getPendingCarReceiptRequestsForOwner: mocks.getPendingCarReceiptRequestsForOwner }));
vi.mock("@/lib/tracker/sellerReportData", () => ({ getSellerReportData: mocks.getSellerReportData }));
vi.mock("@/lib/tracker/bikeComparison", () => ({ buildBikeComparison: mocks.buildBikeComparison }));
vi.mock("@/lib/tracker/carComparison", () => ({ buildCarComparison: mocks.buildCarComparison }));
vi.mock("@/lib/tracker/carServiceRecord", () => ({ getCarServiceRecords: mocks.getCarServiceRecords }));
vi.mock("@/lib/tracker/carMod", () => ({ getCarMods: mocks.getCarMods }));
vi.mock("@/lib/tracker/carBill", () => ({ getCarBills: mocks.getCarBills }));
vi.mock("@/lib/tracker/carFuelLog", () => ({ getCarFuelLogs: mocks.getCarFuelLogs }));
vi.mock("@/lib/tracker/carReminder", () => ({ getCarReminders: mocks.getCarReminders }));
vi.mock("@/lib/tracker/carReminderStatus", () => ({
  computeCarReminderStatus: mocks.computeCarReminderStatus,
  carReminderDetailLabel: mocks.carReminderDetailLabel,
}));
vi.mock("@/lib/tracker/carSummary", () => ({ gatherCarMileagePoints: mocks.gatherCarMileagePoints }));
vi.mock("@/lib/tracker/labour", () => ({ getLabour: mocks.getLabour }));
vi.mock("@/lib/tracker/carLabour", () => ({ getCarLabour: mocks.getCarLabour }));
vi.mock("@/lib/tracker/fine", () => ({ getFines: mocks.getFines }));
vi.mock("@/lib/tracker/carFine", () => ({ getCarFines: mocks.getCarFines }));
vi.mock("@/lib/tracker/toll", () => ({ getTolls: mocks.getTolls }));
vi.mock("@/lib/tracker/carToll", () => ({ getCarTolls: mocks.getCarTolls }));
// mileageEstimate.ts (estimateMileage) is deliberately NOT mocked - same
// "pure, no I/O, exercise the real logic" reasoning this file already
// applies to bikeComparisonVerdict.ts.
// jobTypes.ts/carJobTypes.ts (JOB_LABELS/CAR_JOB_LABELS) etc. are
// deliberately NOT mocked - pure static data. bikeComparisonVerdict.ts
// (buildCostPerMileVerdict) is deliberately NOT mocked either - it's
// pure, no I/O, so this exercises the real "which bike is cheapest"
// logic rather than a stand-in for it.

import {
  runAssistantTool,
  toolGetSpendTotal,
  toolGetEntries,
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
  toolProposeSettingsChange,
  toolProposeShareLink,
  toolProposeEditEntry,
  toolProposeVaultDocument,
  toolProposeFeedback,
  ASSISTANT_TOOL_DECLARATIONS,
} from "@/lib/tracker/assistantTools";

const bike = {
  id: "bike-1",
  currentMileage: 15000,
  currency: "GBP",
  annualBudget: null as number | null,
  startingMileage: 8000,
  dateAdded: "2020-01-01",
  make: "Honda",
  model: "CB500F",
  nickname: undefined as string | undefined,
};
const car = {
  id: "car-1",
  currentMileage: 20000,
  currency: "GBP",
  annualBudget: null as number | null,
  fuelType: "petrol" as "petrol" | "diesel" | "hybrid" | "phev" | "electric",
  startingMileage: 10000,
  dateAdded: "2020-01-01",
  make: "Ford",
  model: "Focus",
  nickname: undefined as string | undefined,
};

function bikeActive(overrides: Partial<typeof bike> = {}) {
  return { kind: "bike" as const, bike: { ...bike, ...overrides }, hasAnyCar: false };
}
function carActive(overrides: Partial<typeof car> = {}) {
  return { kind: "car" as const, car: { ...car, ...overrides }, hasAnyBike: false };
}
// Same shape resolveAllActiveVehicles itself returns (no hasAnyCar/
// hasAnyBike, unlike the single-vehicle bikeActive/carActive above).
function bikeRef(overrides: Partial<typeof bike> = {}) {
  return { kind: "bike" as const, bike: { ...bike, ...overrides } };
}
function carRef(overrides: Partial<typeof car> = {}) {
  return { kind: "car" as const, car: { ...car, ...overrides } };
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.resolveActiveVehicle.mockResolvedValue(bikeActive());
  mocks.resolveAllActiveVehicles.mockResolvedValue([]);
  mocks.getServiceRecords.mockResolvedValue([]);
  mocks.getMods.mockResolvedValue([]);
  mocks.getBills.mockResolvedValue([]);
  mocks.getFuelLogs.mockResolvedValue([]);
  mocks.getReminders.mockResolvedValue([]);
  mocks.getShareLinksForUser.mockResolvedValue([]);
  mocks.getPendingReceiptRequestsForOwner.mockResolvedValue([]);
  mocks.getCarServiceRecords.mockResolvedValue([]);
  mocks.getCarMods.mockResolvedValue([]);
  mocks.getCarBills.mockResolvedValue([]);
  mocks.getCarFuelLogs.mockResolvedValue([]);
  mocks.getCarReminders.mockResolvedValue([]);
  mocks.getLabour.mockResolvedValue([]);
  mocks.getCarLabour.mockResolvedValue([]);
  mocks.getFines.mockResolvedValue([]);
  mocks.getCarFines.mockResolvedValue([]);
  mocks.getTolls.mockResolvedValue([]);
  mocks.getCarTolls.mockResolvedValue([]);
  mocks.buildCarComparison.mockResolvedValue([]);
  mocks.getCarShareLinksForUser.mockResolvedValue([]);
  mocks.getPendingCarReceiptRequestsForOwner.mockResolvedValue([]);
  // Safe default for every toolProposeLogEntry test that isn't itself
  // testing mileage estimation - individual tests below override this
  // with real points when they need to exercise estimateMileage's own
  // interpolation/extrapolation logic (that function is deliberately not
  // mocked - see the vi.mock comment above).
  mocks.gatherMileagePoints.mockReturnValue([]);
  mocks.gatherCarMileagePoints.mockReturnValue([]);
});

describe("runAssistantTool - the core security dispatch layer", () => {
  it("every tool declared in ASSISTANT_TOOL_DECLARATIONS actually dispatches, none silently fall through to 'unknown tool'", async () => {
    mocks.computeActualMPG.mockReturnValue(null); // so getMpgTrend takes its real "not enough data" branch, not undefined.filter()
    for (const tool of ASSISTANT_TOOL_DECLARATIONS) {
      const result: any = await runAssistantTool(tool.name, { jobQuery: "oil" }, "owner@example.com", await mocks.resolveActiveVehicle());
      if (result?.error) expect(result.error).not.toMatch(/^Unknown tool/);
    }
  });

  it("returns a generic error for a genuinely unknown tool name, rather than throwing", async () => {
    const result: any = await runAssistantTool("deleteEverything", {}, "owner@example.com", await mocks.resolveActiveVehicle());
    expect(result).toEqual({ error: "Unknown tool: deleteEverything" });
  });

  // proposeFeedback isn't part of ASSISTANT_TOOL_DECLARATIONS (its own
  // FEEDBACK_TOOL_DECLARATIONS array, gated independently in route.ts),
  // so it isn't covered by the "every declared tool dispatches" loop
  // above - same reason getViewedReport/proposeLogEntry etc. get their
  // own explicit dispatch tests too.
  it("dispatches proposeFeedback", async () => {
    const result: any = await runAssistantTool("proposeFeedback", { feedbackType: "bug", message: "It broke" }, "owner@example.com", await mocks.resolveActiveVehicle());
    expect(result).toEqual({ category: "feedback", feedbackType: "bug", message: "It broke" });
  });

  // The entire stated purpose of this file: no session-scoped tool ever
  // reads which account to act on from the model-supplied args - only
  // the separately-passed, server-derived email parameter. Vehicle
  // resolution itself has moved up to route.ts (a single
  // resolveActiveVehicle(session.email) call, threaded through as
  // resolvedVehicle - see assistantTools.ts's own comment on
  // runAssistantTool), so this now checks the email actually used for
  // the underlying data fetch, rather than a resolveActiveVehicle call
  // this layer no longer makes.
  it("uses only the server-derived email parameter, ignoring any account identifier the model-supplied args might contain", async () => {
    await runAssistantTool("getSpendTotal", { email: "attacker@example.com", userId: "someone-else" } as any, "real-owner@example.com", await mocks.resolveActiveVehicle());
    expect(mocks.getServiceRecords).toHaveBeenCalledWith("real-owner@example.com", expect.anything());
  });

  it("getViewedReport refuses to run at all when no report token was independently verified by the caller", async () => {
    const result: any = await runAssistantTool("getViewedReport", {}, "owner@example.com", await mocks.resolveActiveVehicle());
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

    await runAssistantTool("getViewedReport", { shareToken: "attacker-supplied-token" } as any, "", null, "real-verified-token");

    expect(mocks.getSellerReportData).toHaveBeenCalledWith("real-verified-token");
  });

  it("getViewedComparison refuses to run at all when no compareContext was independently verified by the caller", async () => {
    const result: any = await runAssistantTool("getViewedComparison", {}, "owner@example.com", await mocks.resolveActiveVehicle());
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
      null,
      undefined,
      { vehicleIds: ["real-bike-1", "real-bike-2"], bikeIds: ["real-bike-1", "real-bike-2"], carIds: [] }
    );

    expect(mocks.buildBikeComparison).toHaveBeenCalledWith("real-owner@example.com", ["real-bike-1", "real-bike-2"], undefined);
  });
});

describe("toolGetViewedComparison", () => {
  const bikeA = { bikeId: "b-1", name: "Africa Twin", costPerMile: 0.1, spend: { grandTotal: 500 }, milesRidden: 5000, actualMpg: 55, serviceCount: 3, documentationPct: 80, nextDue: null };
  const bikeB = { bikeId: "b-2", name: "Tiger 900", costPerMile: 0.2, spend: { grandTotal: 800 }, milesRidden: 4000, actualMpg: 45, serviceCount: 2, documentationPct: 60, nextDue: { name: "MOT", status: "due-soon" } };
  const carC = { bikeId: "c-1", kind: "car" as const, name: "Focus", costPerMile: 0.15, spend: { grandTotal: 600 }, milesRidden: 4500, actualMpg: 48, serviceCount: 2, documentationPct: null, nextDue: null };

  it("returns an error when fewer than two vehicles could be loaded", async () => {
    mocks.buildBikeComparison.mockResolvedValue([bikeA]);
    const result = await toolGetViewedComparison("owner@example.com", { vehicleIds: ["b-1", "b-2"], bikeIds: ["b-1", "b-2"], carIds: [] });
    expect(result).toEqual({ error: "Couldn't load this comparison right now." });
  });

  it("returns the computed cheapest-to-run verdict alongside each vehicle's own figures", async () => {
    mocks.buildBikeComparison.mockResolvedValue([bikeA, bikeB]);
    const result: any = await toolGetViewedComparison("owner@example.com", { vehicleIds: ["b-1", "b-2"], bikeIds: ["b-1", "b-2"], carIds: [] });

    expect(result.period).toBe("overall");
    expect(result.cheapestToRunVerdict).toContain("Africa Twin");
    expect(result.vehicles).toEqual([
      { name: "Africa Twin", kind: "bike", costPerMile: 0.1, totalSpend: 500, milesRidden: 5000, actualMpg: 55, servicesLogged: 3, documentationCoveragePct: 80, dueSoonest: null },
      { name: "Tiger 900", kind: "bike", costPerMile: 0.2, totalSpend: 800, milesRidden: 4000, actualMpg: 45, servicesLogged: 2, documentationCoveragePct: 60, dueSoonest: { name: "MOT", status: "due-soon" } },
    ]);
  });

  it("merges a mixed bike+car comparison, ordered by the original on-screen selection order rather than 'every bike then every car'", async () => {
    mocks.buildBikeComparison.mockResolvedValue([bikeA]);
    mocks.buildCarComparison.mockResolvedValue([carC]);
    const result: any = await toolGetViewedComparison("owner@example.com", { vehicleIds: ["c-1", "b-1"], bikeIds: ["b-1"], carIds: ["c-1"] });

    expect(result.vehicles.map((v: any) => v.name)).toEqual(["Focus", "Africa Twin"]);
    expect(result.vehicles[0].kind).toBe("car");
    expect(result.vehicles[1].kind).toBe("bike");
  });

  it("passes a from/to period through to buildBikeComparison/buildCarComparison and reports it back, rather than always 'overall'", async () => {
    mocks.buildBikeComparison.mockResolvedValue([bikeA, bikeB]);
    await toolGetViewedComparison("owner@example.com", { vehicleIds: ["b-1", "b-2"], bikeIds: ["b-1", "b-2"], carIds: [], from: "2025-01-01" });
    expect(mocks.buildBikeComparison).toHaveBeenCalledWith("owner@example.com", ["b-1", "b-2"], { from: "2025-01-01", to: undefined });
    expect(mocks.buildCarComparison).toHaveBeenCalledWith("owner@example.com", [], { from: "2025-01-01", to: undefined });

    const result: any = await toolGetViewedComparison("owner@example.com", { vehicleIds: ["b-1", "b-2"], bikeIds: ["b-1", "b-2"], carIds: [], from: "2025-01-01" });
    expect(result.period).toEqual({ from: "2025-01-01", to: null });
  });

  it("fails safely with a plain tool error, never an unhandled throw, if the underlying lookup rejects", async () => {
    mocks.buildBikeComparison.mockRejectedValue(new Error("Cosmos unavailable"));
    const result = await toolGetViewedComparison("owner@example.com", { vehicleIds: ["b-1", "b-2"], bikeIds: ["b-1", "b-2"], carIds: [] });
    expect(result).toEqual({ error: "Couldn't load this comparison right now." });
  });
});

describe("toolGetSpendTotal", () => {
  it("returns an error when the account has no vehicle at all", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    expect(await toolGetSpendTotal("owner@example.com", await mocks.resolveActiveVehicle(), {})).toEqual({ error: "No vehicle found on this account." });
  });

  it("totals across all categories when none is specified", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ date: "2025-01-01", cost: 100 }]);
    mocks.getFuelLogs.mockResolvedValue([{ date: "2025-01-01", cost: 50 }]);
    const result: any = await toolGetSpendTotal("owner@example.com", await mocks.resolveActiveVehicle(), {});
    expect(result.total).toBe(150);
    expect(result.category).toBe("all");
  });

  it("filters to a single category when specified", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ date: "2025-01-01", cost: 100 }]);
    mocks.getFuelLogs.mockResolvedValue([{ date: "2025-01-01", cost: 50 }]);
    const result: any = await toolGetSpendTotal("owner@example.com", await mocks.resolveActiveVehicle(), { category: "fuel" });
    expect(result.total).toBe(50);
  });

  it("filters by an inclusive date range", async () => {
    mocks.getServiceRecords.mockResolvedValue([
      { date: "2024-06-01", cost: 100 }, // before range
      { date: "2025-06-01", cost: 50 },  // in range
    ]);
    const result: any = await toolGetSpendTotal("owner@example.com", await mocks.resolveActiveVehicle(), { startDate: "2025-01-01", endDate: "2025-12-31" });
    expect(result.total).toBe(50);
    expect(result.entryCount).toBe(1);
  });

  describe("car-active session", () => {
    beforeEach(() => mocks.resolveActiveVehicle.mockResolvedValue(carActive()));

    it("uses the car's own doc fetches, not the bike ones", async () => {
      mocks.getCarServiceRecords.mockResolvedValue([{ date: "2025-01-01", cost: 100 }]);
      mocks.getCarFuelLogs.mockResolvedValue([{ date: "2025-01-01", cost: 50 }]);
      const result: any = await toolGetSpendTotal("owner@example.com", await mocks.resolveActiveVehicle(), {});
      expect(result.total).toBe(150);
      expect(mocks.getServiceRecords).not.toHaveBeenCalled();
      expect(mocks.getFuelLogs).not.toHaveBeenCalled();
    });
  });

  describe("scope: 'all'", () => {
    it("returns an error when the account has no active vehicles at all", async () => {
      mocks.resolveAllActiveVehicles.mockResolvedValue([]);
      expect(await toolGetSpendTotal("owner@example.com", await mocks.resolveActiveVehicle(), { scope: "all" })).toEqual({ error: "No vehicle found on this account." });
    });

    it("sums spend across a bike and a car, with a per-vehicle breakdown labelled by nickname/make/model", async () => {
      mocks.resolveAllActiveVehicles.mockResolvedValue([bikeRef({ nickname: "Daily" }), carRef()]);
      mocks.getServiceRecords.mockResolvedValue([{ date: "2025-01-01", cost: 100 }]);
      mocks.getCarServiceRecords.mockResolvedValue([{ date: "2025-01-01", cost: 300 }]);

      const result: any = await toolGetSpendTotal("owner@example.com", await mocks.resolveActiveVehicle(), { scope: "all" });

      expect(result.scope).toBe("all");
      expect(result.total).toBe(400);
      expect(result.currency).toBe("GBP");
      expect(result.byVehicle).toEqual([
        { name: "Daily (Honda CB500F)", kind: "bike", total: 100, entryCount: 1 },
        { name: "Ford Focus", kind: "car", total: 300, entryCount: 1 },
      ]);
    });

    it("still respects a category filter across every vehicle", async () => {
      mocks.resolveAllActiveVehicles.mockResolvedValue([bikeRef(), carRef()]);
      mocks.getServiceRecords.mockResolvedValue([{ date: "2025-01-01", cost: 100 }]);
      mocks.getFuelLogs.mockResolvedValue([{ date: "2025-01-01", cost: 20 }]);
      mocks.getCarBills.mockResolvedValue([{ date: "2025-01-01", cost: 300 }]);

      const result: any = await toolGetSpendTotal("owner@example.com", await mocks.resolveActiveVehicle(), { scope: "all", category: "servicing" });

      expect(result.total).toBe(100); // only the bike's servicing record - fuel and the car's bill are excluded
      expect(result.category).toBe("servicing");
    });
  });
});

describe("toolGetEntries", () => {
  it("refuses to run without a date or a range, rather than dumping the whole history", async () => {
    const result = await toolGetEntries("owner@example.com", await mocks.resolveActiveVehicle(), {});
    expect(result).toEqual({ error: "Needs a date, or a start/end range, to look up - which day, or which period?" });
  });

  it("returns an error when the account has no vehicle at all", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    const result = await toolGetEntries("owner@example.com", await mocks.resolveActiveVehicle(), { date: "2025-01-01" });
    expect(result).toEqual({ error: "No vehicle found on this account." });
  });

  it("lists the individual entries for a single day, across every category, with a real description each", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ date: "2026-01-05", cost: 12.78, jobType: "oil-filter", notes: "" }]);
    mocks.getFuelLogs.mockResolvedValue([{ date: "2025-01-01", cost: 20, litres: 10, filledToFull: false }]); // different day, excluded

    const result: any = await toolGetEntries("owner@example.com", await mocks.resolveActiveVehicle(), { date: "2026-01-05" });

    expect(result.entries).toEqual([
      { date: "2026-01-05", category: "service", description: "Oil & filter change", cost: 12.78 },
    ]);
    expect(result.entryCount).toBe(1);
    expect(result.totalCost).toBe(12.78);
  });

  it("appends notes to the category label rather than replacing it", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ date: "2026-01-05", cost: 40, jobType: "oil-filter", notes: "done at Halfords" }]);
    const result: any = await toolGetEntries("owner@example.com", await mocks.resolveActiveVehicle(), { date: "2026-01-05" });
    expect(result.entries[0].description).toBe("Oil & filter change - done at Halfords");
  });

  it("describes a fuel entry with litres and a full-tank note, since fuel logs have no description field at all", async () => {
    mocks.getFuelLogs.mockResolvedValue([{ date: "2026-01-05", cost: 15, litres: 10, filledToFull: true }]);
    const result: any = await toolGetEntries("owner@example.com", await mocks.resolveActiveVehicle(), { date: "2026-01-05" });
    expect(result.entries[0]).toEqual({ date: "2026-01-05", category: "fuel", description: "Fuel fill-up - 10L (full tank)", cost: 15 });
  });

  it("describes a mod entry with its resolved category label and its own name", async () => {
    mocks.getMods.mockResolvedValue([{ date: "2026-01-05", cost: 12, category: "other-accessory", name: "Szuwax detailing spray", notes: "" }]);
    const result: any = await toolGetEntries("owner@example.com", await mocks.resolveActiveVehicle(), { date: "2026-01-05" });
    expect(result.entries[0].description).toBe("Other accessory - Szuwax detailing spray");
  });

  it("describes a bill entry with its resolved bill-type label", async () => {
    mocks.getBills.mockResolvedValue([{ date: "2026-01-05", cost: 300, billType: "insurance", notes: "" }]);
    const result: any = await toolGetEntries("owner@example.com", await mocks.resolveActiveVehicle(), { date: "2026-01-05" });
    expect(result.entries[0].description).toBe("Insurance");
  });

  it("filters to a single category when specified", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ date: "2026-01-05", cost: 40, jobType: "oil-filter", notes: "" }]);
    mocks.getFuelLogs.mockResolvedValue([{ date: "2026-01-05", cost: 15, litres: 10, filledToFull: false }]);
    const result: any = await toolGetEntries("owner@example.com", await mocks.resolveActiveVehicle(), { date: "2026-01-05", category: "fuel" });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].category).toBe("fuel");
  });

  it("filters by an inclusive start/end range", async () => {
    mocks.getServiceRecords.mockResolvedValue([
      { date: "2024-06-01", cost: 100, jobType: "other", notes: "" }, // before range
      { date: "2025-06-01", cost: 50, jobType: "other", notes: "" },  // in range
    ]);
    const result: any = await toolGetEntries("owner@example.com", await mocks.resolveActiveVehicle(), { startDate: "2025-01-01", endDate: "2025-12-31" });
    expect(result.entryCount).toBe(1);
    expect(result.entries[0].date).toBe("2025-06-01");
  });

  it("sorts entries chronologically regardless of category fetch order", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ date: "2026-01-10", cost: 40, jobType: "other", notes: "" }]);
    mocks.getFuelLogs.mockResolvedValue([{ date: "2026-01-01", cost: 15, litres: 10, filledToFull: false }]);
    const result: any = await toolGetEntries("owner@example.com", await mocks.resolveActiveVehicle(), { startDate: "2026-01-01", endDate: "2026-01-31" });
    expect(result.entries.map((e: any) => e.date)).toEqual(["2026-01-01", "2026-01-10"]);
  });

  it("returns a plain empty result with a note, rather than an error, when nothing matches", async () => {
    const result: any = await toolGetEntries("owner@example.com", await mocks.resolveActiveVehicle(), { date: "2026-01-05" });
    expect(result).toEqual({ entries: [], entryCount: 0, totalCost: 0, currency: "GBP", note: "Nothing logged in that range." });
  });

  describe("car-active session", () => {
    beforeEach(() => mocks.resolveActiveVehicle.mockResolvedValue(carActive()));

    it("uses the car's own doc fetches and car job/bill/mod labels, not the bike ones", async () => {
      mocks.getCarServiceRecords.mockResolvedValue([{ date: "2026-01-05", cost: 40, jobType: "oil-filter", notes: "" }]);
      const result: any = await toolGetEntries("owner@example.com", await mocks.resolveActiveVehicle(), { date: "2026-01-05" });
      expect(result.entries[0].category).toBe("service");
      expect(mocks.getServiceRecords).not.toHaveBeenCalled();
    });

    it("describes a litres-based car fuel entry the same way as a bike's", async () => {
      mocks.getCarFuelLogs.mockResolvedValue([{ date: "2026-01-05", cost: 15, litres: 10, filledToFull: true }]);
      const result: any = await toolGetEntries("owner@example.com", await mocks.resolveActiveVehicle(), { date: "2026-01-05" });
      expect(result.entries[0].description).toBe("Fuel fill-up - 10L (full tank)");
    });

    it("describes a kWh-based car charging entry, not litres", async () => {
      mocks.getCarFuelLogs.mockResolvedValue([{ date: "2026-01-05", cost: 8, kwh: 22 }]);
      const result: any = await toolGetEntries("owner@example.com", await mocks.resolveActiveVehicle(), { date: "2026-01-05" });
      expect(result.entries[0].description).toBe("Charge - 22kWh");
    });

    it("resolves a car-only bill type (e.g. congestion charge) that has no bike equivalent", async () => {
      mocks.getCarBills.mockResolvedValue([{ date: "2026-01-05", cost: 15, billType: "congestion", notes: "" }]);
      const result: any = await toolGetEntries("owner@example.com", await mocks.resolveActiveVehicle(), { date: "2026-01-05" });
      expect(result.entries[0].description).toMatch(/congestion/i);
    });
  });

  describe("scope: 'all'", () => {
    it("returns an error when the account has no active vehicles at all", async () => {
      mocks.resolveAllActiveVehicles.mockResolvedValue([]);
      expect(await toolGetEntries("owner@example.com", await mocks.resolveActiveVehicle(), { date: "2026-01-05", scope: "all" })).toEqual({ error: "No vehicle found on this account." });
    });

    it("merges entries from every vehicle, each tagged with its own vehicle name, sorted by date", async () => {
      mocks.resolveAllActiveVehicles.mockResolvedValue([bikeRef({ nickname: "Daily" }), carRef()]);
      mocks.getServiceRecords.mockResolvedValue([{ date: "2026-01-05", cost: 40, jobType: "oil-filter", notes: "" }]);
      mocks.getCarServiceRecords.mockResolvedValue([{ date: "2026-01-04", cost: 60, jobType: "oil-filter", notes: "" }]);

      const result: any = await toolGetEntries("owner@example.com", await mocks.resolveActiveVehicle(), { startDate: "2026-01-04", endDate: "2026-01-05", scope: "all" });

      expect(result.scope).toBe("all");
      expect(result.entries.map((e: any) => e.vehicleName)).toEqual(["Ford Focus", "Daily (Honda CB500F)"]);
      expect(result.entries.map((e: any) => e.vehicleKind)).toEqual(["car", "bike"]);
      expect(result.entryCount).toBe(2);
      expect(result.totalCost).toBe(100);
    });
  });
});

describe("toolGetMileage", () => {
  it("returns current mileage when no date is asked about", async () => {
    const result: any = await toolGetMileage("owner@example.com", await mocks.resolveActiveVehicle(), {});
    expect(result).toEqual({ mileage: 15000, asOf: "current" });
  });

  // An honest, labelled approximation, never a fabricated exact figure
  // for a date nothing was actually logged on.
  it("picks the closest logged point to the requested date and labels it as an approximation", async () => {
    mocks.gatherMileagePoints.mockReturnValue([
      { date: "2025-01-01", mileage: 10000 },
      { date: "2025-06-01", mileage: 13000 },
    ]);
    const result: any = await toolGetMileage("owner@example.com", await mocks.resolveActiveVehicle(), { atDate: "2025-05-20" });
    expect(result.mileage).toBe(13000);
    expect(result.asOf).toBe("2025-06-01");
    expect(result.note).toContain("Closest logged reading");
  });

  it("returns an error when no mileage history is logged at all", async () => {
    mocks.gatherMileagePoints.mockReturnValue([]);
    expect(await toolGetMileage("owner@example.com", await mocks.resolveActiveVehicle(), { atDate: "2025-01-01" })).toEqual({ error: "No mileage history logged yet." });
  });

  it("returns an error when the account has no vehicle at all", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    expect(await toolGetMileage("owner@example.com", await mocks.resolveActiveVehicle(), {})).toEqual({ error: "No vehicle found on this account." });
  });

  describe("car-active session", () => {
    beforeEach(() => mocks.resolveActiveVehicle.mockResolvedValue(carActive()));

    it("returns the car's own current mileage, via gatherCarMileagePoints not gatherMileagePoints", async () => {
      expect(await toolGetMileage("owner@example.com", await mocks.resolveActiveVehicle(), {})).toEqual({ mileage: 20000, asOf: "current" });

      mocks.gatherCarMileagePoints.mockReturnValue([{ date: "2025-06-01", mileage: 18000 }]);
      const result: any = await toolGetMileage("owner@example.com", await mocks.resolveActiveVehicle(), { atDate: "2025-06-01" });
      expect(result.mileage).toBe(18000);
      expect(mocks.gatherMileagePoints).not.toHaveBeenCalled();
    });
  });
});

describe("toolGetMpgTrend", () => {
  it("reports insufficient data plainly rather than a partial or fabricated figure", async () => {
    mocks.computeActualMPG.mockReturnValue(null);
    expect(await toolGetMpgTrend("owner@example.com", await mocks.resolveActiveVehicle())).toEqual({
      hasEnoughData: false,
      reason: "Needs at least two consecutive full-tank fill-ups logged.",
    });
  });

  it("reports recent fill-ups trending above the overall average", async () => {
    mocks.computeActualMPG.mockReturnValue(50);
    mocks.computeMPGSeries.mockReturnValue([{ mpg: 55, exclusionReason: undefined }]);
    const result: any = await toolGetMpgTrend("owner@example.com", await mocks.resolveActiveVehicle());
    expect(result.trend).toBe("recent fill-ups above average");
  });

  it("reports steady when the most recent fill-up excludes to nothing usable", async () => {
    mocks.computeActualMPG.mockReturnValue(50);
    mocks.computeMPGSeries.mockReturnValue([{ mpg: 999, exclusionReason: "anomaly" }]);
    const result: any = await toolGetMpgTrend("owner@example.com", await mocks.resolveActiveVehicle());
    expect(result.trend).toBe("steady");
    expect(result.mostRecentFillUpMpg).toBeUndefined();
  });

  it("returns an error when the account has no vehicle at all", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    expect(await toolGetMpgTrend("owner@example.com", await mocks.resolveActiveVehicle())).toEqual({ error: "No vehicle found on this account." });
  });

  describe("car-active session", () => {
    it("reports MPG doesn't apply for an electric car, without touching the litres-based mpg calc at all", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive({ fuelType: "electric" }));
      const result: any = await toolGetMpgTrend("owner@example.com", await mocks.resolveActiveVehicle());
      expect(result.hasEnoughData).toBe(false);
      expect(result.reason).toMatch(/electric/i);
      expect(mocks.getCarFuelLogs).not.toHaveBeenCalled();
      expect(mocks.computeActualMPG).not.toHaveBeenCalled();
    });

    it("computes MPG for a non-electric car from its own litres-based fuel logs", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive({ fuelType: "petrol" }));
      mocks.getCarFuelLogs.mockResolvedValue([{ id: "f1", date: "2025-01-01", litres: 40, mileage: 5000, filledToFull: true }]);
      mocks.computeActualMPG.mockReturnValue(50);
      mocks.computeMPGSeries.mockReturnValue([{ mpg: 50, exclusionReason: undefined }]);
      const result: any = await toolGetMpgTrend("owner@example.com", await mocks.resolveActiveVehicle());
      expect(result.hasEnoughData).toBe(true);
      expect(mocks.getFuelLogs).not.toHaveBeenCalled();
    });
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

    const result: any = await toolGetReminders("owner@example.com", await mocks.resolveActiveVehicle());

    expect(result.upcoming).toHaveLength(1);
    expect(result.upcoming[0].name).toBe("MOT");
    expect(result.overdue).toHaveLength(1);
  });

  it("returns an error when the account has no vehicle at all", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    expect(await toolGetReminders("owner@example.com", await mocks.resolveActiveVehicle())).toEqual({ error: "No vehicle found on this account." });
  });

  describe("car-active session", () => {
    beforeEach(() => mocks.resolveActiveVehicle.mockResolvedValue(carActive()));

    it("uses computeCarReminderStatus/carReminderDetailLabel, not the bike versions", async () => {
      mocks.getCarReminders.mockResolvedValue([{ name: "MOT renewal" }]);
      mocks.computeCarReminderStatus.mockReturnValue("overdue");
      mocks.carReminderDetailLabel.mockReturnValue("overdue since 1 Jun 2026");

      const result: any = await toolGetReminders("owner@example.com", await mocks.resolveActiveVehicle());

      expect(result.overdue).toHaveLength(1);
      expect(mocks.computeReminderStatus).not.toHaveBeenCalled();
      expect(mocks.getReminders).not.toHaveBeenCalled();
    });
  });

  describe("scope: 'all'", () => {
    it("returns an error when the account has no active vehicles at all", async () => {
      mocks.resolveAllActiveVehicles.mockResolvedValue([]);
      expect(await toolGetReminders("owner@example.com", await mocks.resolveActiveVehicle(), { scope: "all" })).toEqual({ error: "No vehicle found on this account." });
    });

    it("merges each vehicle's reminders into one grouped result, each tagged with its own vehicle name", async () => {
      mocks.resolveAllActiveVehicles.mockResolvedValue([bikeRef({ nickname: "Daily" }), carRef()]);
      mocks.getReminders.mockResolvedValue([{ name: "MOT" }]);
      mocks.computeReminderStatus.mockReturnValue("overdue");
      mocks.reminderDetailLabel.mockReturnValue("overdue");
      mocks.getCarReminders.mockResolvedValue([{ name: "Service" }]);
      mocks.computeCarReminderStatus.mockReturnValue("due-soon");
      mocks.carReminderDetailLabel.mockReturnValue("due soon");

      const result: any = await toolGetReminders("owner@example.com", await mocks.resolveActiveVehicle(), { scope: "all" });

      expect(result.scope).toBe("all");
      expect(result.overdue).toEqual([{ name: "MOT", status: "overdue", detail: "overdue", vehicleName: "Daily (Honda CB500F)" }]);
      expect(result.dueSoon).toEqual([{ name: "Service", status: "due-soon", detail: "due soon", vehicleName: "Ford Focus" }]);
    });
  });
});

describe("toolGetBudgetProgress", () => {
  it("reports no budget when none is set, without attempting to compute spend", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(bikeActive({ annualBudget: null }));
    expect(await toolGetBudgetProgress("owner@example.com", await mocks.resolveActiveVehicle())).toEqual({ hasBudget: false });
    expect(mocks.getServiceRecords).not.toHaveBeenCalled();
  });

  it("only counts spend from the current calendar year toward budget progress", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(bikeActive({ annualBudget: 1000 }));
    mocks.getServiceRecords.mockResolvedValue([
      { date: "2020-01-01", cost: 500 }, // a past year, must not count
      { date: `${new Date().getFullYear()}-01-01`, cost: 200 },
    ]);
    const result: any = await toolGetBudgetProgress("owner@example.com", await mocks.resolveActiveVehicle());
    expect(result.spentThisYear).toBe(200);
    expect(result.remaining).toBe(800);
  });

  it("returns an error when the account has no vehicle at all", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    expect(await toolGetBudgetProgress("owner@example.com", await mocks.resolveActiveVehicle())).toEqual({ error: "No vehicle found on this account." });
  });

  describe("car-active session", () => {
    it("reports no budget when the car has none set, without fetching any car records", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive({ annualBudget: null }));
      expect(await toolGetBudgetProgress("owner@example.com", await mocks.resolveActiveVehicle())).toEqual({ hasBudget: false });
      expect(mocks.getCarServiceRecords).not.toHaveBeenCalled();
    });

    it("computes the car's own year-to-date spend against its own budget", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive({ annualBudget: 1000 }));
      mocks.getCarServiceRecords.mockResolvedValue([{ date: `${new Date().getFullYear()}-01-01`, cost: 300 }]);
      const result: any = await toolGetBudgetProgress("owner@example.com", await mocks.resolveActiveVehicle());
      expect(result.spentThisYear).toBe(300);
      expect(result.remaining).toBe(700);
      expect(mocks.getServiceRecords).not.toHaveBeenCalled();
    });
  });

  describe("scope: 'all'", () => {
    it("returns an error when the account has no active vehicles at all", async () => {
      mocks.resolveAllActiveVehicles.mockResolvedValue([]);
      expect(await toolGetBudgetProgress("owner@example.com", await mocks.resolveActiveVehicle(), { scope: "all" })).toEqual({ error: "No vehicle found on this account." });
    });

    it("reports no budget when none of the account's vehicles has one set", async () => {
      mocks.resolveAllActiveVehicles.mockResolvedValue([bikeRef({ annualBudget: null }), carRef({ annualBudget: null })]);
      expect(await toolGetBudgetProgress("owner@example.com", await mocks.resolveActiveVehicle(), { scope: "all" })).toEqual({ scope: "all", hasBudget: false });
    });

    it("combines budgets across every vehicle that has one set, and notes when a vehicle without one was left out", async () => {
      mocks.resolveAllActiveVehicles.mockResolvedValue([bikeRef({ nickname: "Daily", annualBudget: 1000 }), carRef({ annualBudget: null })]);
      mocks.getServiceRecords.mockResolvedValue([{ date: `${new Date().getFullYear()}-01-01`, cost: 200 }]);

      const result: any = await toolGetBudgetProgress("owner@example.com", await mocks.resolveActiveVehicle(), { scope: "all" });

      expect(result.scope).toBe("all");
      expect(result.hasBudget).toBe(true);
      expect(result.byVehicle).toEqual([{ name: "Daily (Honda CB500F)", kind: "bike", budget: 1000, spentThisYear: 200, remaining: 800 }]);
      expect(result.combinedBudget).toBe(1000);
      expect(result.combinedSpent).toBe(200);
      expect(mocks.getCarServiceRecords).not.toHaveBeenCalled(); // the budget-less car is skipped entirely, not fetched
      expect(result.note).toMatch(/1 of your active vehicles has no budget set/);
    });
  });
});

describe("toolGetLastLoggedJob", () => {
  // The exact historical bug the source comment references: jobQuery is
  // declared "required" in the tool schema, but that's a hint to the
  // model, not a runtime guarantee - trusting it unchecked previously
  // caused a real build failure.
  it("handles a missing or non-string jobQuery gracefully, rather than trusting the declared schema", async () => {
    expect(await toolGetLastLoggedJob("owner@example.com", await mocks.resolveActiveVehicle(), {})).toEqual({ error: "No job type specified." });
    expect(await toolGetLastLoggedJob("owner@example.com", await mocks.resolveActiveVehicle(), { jobQuery: 42 })).toEqual({ error: "No job type specified." });
  });

  it("returns not-found when there are no service records at all", async () => {
    expect(await toolGetLastLoggedJob("owner@example.com", await mocks.resolveActiveVehicle(), { jobQuery: "oil" })).toEqual({ found: false });
  });

  it("matches by substring against the job label, case-insensitively", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ jobType: "oil-filter", date: "2025-01-01", mileage: 5000, cost: 40 }]);
    const result: any = await toolGetLastLoggedJob("owner@example.com", await mocks.resolveActiveVehicle(), { jobQuery: "OIL" });
    expect(result.found).toBe(true);
  });

  it("picks the most recent matching record when several exist", async () => {
    mocks.getServiceRecords.mockResolvedValue([
      { jobType: "oil-filter", date: "2024-01-01", mileage: 4000, cost: 40 },
      { jobType: "oil-filter", date: "2025-06-01", mileage: 8000, cost: 45 },
    ]);
    const result: any = await toolGetLastLoggedJob("owner@example.com", await mocks.resolveActiveVehicle(), { jobQuery: "oil" });
    expect(result.date).toBe("2025-06-01");
  });

  it("returns an error when the account has no vehicle at all", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    expect(await toolGetLastLoggedJob("owner@example.com", await mocks.resolveActiveVehicle(), { jobQuery: "oil" })).toEqual({ error: "No vehicle found on this account." });
  });

  describe("car-active session", () => {
    beforeEach(() => mocks.resolveActiveVehicle.mockResolvedValue(carActive()));

    it("looks up the car's own service records via car job labels, not the bike ones", async () => {
      mocks.getCarServiceRecords.mockResolvedValue([{ jobType: "oil-filter", date: "2025-01-01", mileage: 5000, cost: 40 }]);
      const result: any = await toolGetLastLoggedJob("owner@example.com", await mocks.resolveActiveVehicle(), { jobQuery: "oil" });
      expect(result.found).toBe(true);
      expect(mocks.getServiceRecords).not.toHaveBeenCalled();
    });
  });
});

describe("toolGetShareLinks", () => {
  it("filters links down to the primary bike only, ignoring links for any other bike on the account", async () => {
    mocks.getShareLinksForUser.mockResolvedValue([
      { bikeId: "bike-1", recipientEmail: "buyer@example.com", createdAt: "2025-01-01" },
      { bikeId: "some-other-bike", recipientEmail: "x@example.com", createdAt: "2025-01-01" },
    ]);
    const result: any = await toolGetShareLinks("owner@example.com", await mocks.resolveActiveVehicle());
    expect(result.activeLinkCount).toBe(1);
  });

  it("excludes an expired link from the active count", async () => {
    mocks.getShareLinksForUser.mockResolvedValue([
      { bikeId: "bike-1", recipientEmail: "buyer@example.com", createdAt: "2025-01-01", expiresAt: "2020-01-01" },
    ]);
    const result: any = await toolGetShareLinks("owner@example.com", await mocks.resolveActiveVehicle());
    expect(result.hasActiveLinks).toBe(false);
  });

  it("still reports the pending receipt-request count even when there are no active links", async () => {
    mocks.getPendingReceiptRequestsForOwner.mockResolvedValue([{ bikeId: "bike-1" }]);
    const result: any = await toolGetShareLinks("owner@example.com", await mocks.resolveActiveVehicle());
    expect(result).toEqual({ hasActiveLinks: false, pendingReceiptRequestCount: 1 });
  });

  it("returns an error when the account has no vehicle at all", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    expect(await toolGetShareLinks("owner@example.com", await mocks.resolveActiveVehicle())).toEqual({ error: "No vehicle found on this account." });
  });

  describe("car-active session", () => {
    beforeEach(() => mocks.resolveActiveVehicle.mockResolvedValue(carActive()));

    it("filters links down to the active car only, via the car-specific lookups, not the bike ones", async () => {
      mocks.getCarShareLinksForUser.mockResolvedValue([
        { carId: "car-1", recipientEmail: "buyer@example.com", createdAt: "2025-01-01" },
        { carId: "some-other-car", recipientEmail: "x@example.com", createdAt: "2025-01-01" },
      ]);
      const result: any = await toolGetShareLinks("owner@example.com", await mocks.resolveActiveVehicle());
      expect(result.activeLinkCount).toBe(1);
      expect(mocks.getShareLinksForUser).not.toHaveBeenCalled();
      expect(mocks.getPendingReceiptRequestsForOwner).not.toHaveBeenCalled();
    });

    it("still reports the pending receipt-request count for the car even when there are no active links", async () => {
      mocks.getPendingCarReceiptRequestsForOwner.mockResolvedValue([{ carId: "car-1" }]);
      const result: any = await toolGetShareLinks("owner@example.com", await mocks.resolveActiveVehicle());
      expect(result).toEqual({ hasActiveLinks: false, pendingReceiptRequestCount: 1 });
    });
  });
});

describe("toolGetStorySoFar", () => {
  it("gives clear guidance when no story has been generated yet, rather than an empty result", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(bikeActive({ storyCache: undefined } as any));
    const result: any = await toolGetStorySoFar("owner@example.com", await mocks.resolveActiveVehicle());
    expect(result.hasStory).toBe(false);
    expect(result.note).toContain("click Generate my story");
  });

  it("returns the cached story when one exists", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(bikeActive({
      storyCache: {
        generatedAt: "2025-06-01",
        response: { verdict: { label: "Well documented", reasons: [] }, sharedStory: ["A good bike."], ownerNotes: ["Log more receipts."] },
      },
    } as any));
    const result: any = await toolGetStorySoFar("owner@example.com", await mocks.resolveActiveVehicle());
    expect(result).toMatchObject({ hasStory: true, story: ["A good bike."], ownerOnlyNotes: ["Log more receipts."] });
  });

  it("returns an error when the account has no vehicle at all", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    expect(await toolGetStorySoFar("owner@example.com", await mocks.resolveActiveVehicle())).toEqual({ error: "No vehicle found on this account." });
  });

  describe("car-active session", () => {
    it("gives clear guidance when no story has been generated yet for the car, rather than an empty result", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive({ storyCache: undefined } as any));
      const result: any = await toolGetStorySoFar("owner@example.com", await mocks.resolveActiveVehicle());
      expect(result.hasStory).toBe(false);
      expect(result.note).toContain("click Generate my story");
    });

    it("returns the car's own cached story when one exists", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive({
        storyCache: {
          generatedAt: "2025-06-01",
          response: { verdict: { label: "Well documented", reasons: [] }, sharedStory: ["A good car."], ownerNotes: ["Log more receipts."] },
        },
      } as any));
      const result: any = await toolGetStorySoFar("owner@example.com", await mocks.resolveActiveVehicle());
      expect(result).toMatchObject({ hasStory: true, story: ["A good car."], ownerOnlyNotes: ["Log more receipts."] });
    });
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
  // Kept a plain 'today' for every test below that isn't itself testing
  // mileage estimation - it takes estimateDraftMileage's same-day
  // shortcut (see mileageEstimate.test.ts/useEstimatedMileage.ts's own
  // reasoning for that shortcut), so these tests can keep asserting an
  // exact current-mileage figure without getting entangled in the real
  // interpolation/extrapolation maths, which has its own dedicated tests
  // further down.
  const today = new Date().toISOString().slice(0, 10);

  it("returns an error when the account has no vehicle at all", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    const result = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service", description: "Oil", cost: 20 });
    expect(result).toEqual({ error: "No vehicle found on this account." });
  });

  it("rejects a genuinely unrecognized category on a car-active session too, since every real category is now available on both vehicle kinds", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(carActive());
    const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "not-a-real-category", description: "Tank pads", cost: 20 } as any);
    expect(result.error).toMatch(/Not sure what category/);
  });

  it("rejects a genuinely unrecognized category rather than guessing", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "not-a-real-category", description: "Petrol", cost: 20 } as any);
    expect(result.error).toMatch(/Not sure what category/);
  });

  it("rejects a missing description", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service", cost: 20, date: today });
    expect(result.error).toMatch(/description/i);
  });

  it("rejects a blank/whitespace-only description", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service", description: "   ", cost: 20, date: today });
    expect(result.error).toMatch(/description/i);
  });

  it("rejects a missing, non-numeric, or non-positive cost", async () => {
    expect((await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service", description: "Oil" }) as any).error).toMatch(/cost/i);
    expect((await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service", description: "Oil", cost: 0 }) as any).error).toMatch(/cost/i);
    expect((await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service", description: "Oil", cost: -5 }) as any).error).toMatch(/cost/i);
    expect((await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service", description: "Oil", cost: NaN }) as any).error).toMatch(/cost/i);
  });

  it("rejects a date in the future rather than logging something that hasn't happened yet", async () => {
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service", description: "Oil", cost: 20, date: tomorrow });
    expect(result.error).toMatch(/future/);
  });

  // The actual fix this whole block exercises: a chat-drafted entry must
  // ask for a date, exactly like the manual dashboard forms' own
  // required date field - never silently assume today, since AI chat
  // was previously the one place in the app doing that.
  it("asks for the date, rather than silently defaulting to today, when none is given or the given one is unparseable", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service", description: "Oil", cost: 20 });
    expect(result.error).toMatch(/what date/i);
    expect(result.date).toBeUndefined();

    const result2: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service", description: "Oil", cost: 20, date: "not-a-date" });
    expect(result2.error).toMatch(/what date/i);
  });

  it("asks for the date on a car-active session too, once past the category/cost gate", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(carActive());
    const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "labour", description: "Cambelt", cost: 60 });
    expect(result.error).toMatch(/what date/i);
  });

  it("drafts a service entry with the recognized jobType and the account's current mileage", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), {
      category: "service", description: "Valve cleaner", cost: 4, date: today, jobType: "oil-filter",
    });
    expect(result).toEqual({
      category: "service", jobType: "oil-filter", jobLabel: expect.any(String),
      description: "Valve cleaner", cost: 4, date: today, mileage: 15000, vehicleKind: "bike",
    });
    expect(result.mileageNote).toBeUndefined(); // today needs no estimate - it's just the current mileage
  });

  it("drafts a valet/wash entry the same way as any other recognized job type", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), {
      category: "service", description: "Full valet", cost: 40, date: today, jobType: "valet",
    });
    expect(result.jobType).toBe("valet");
    expect(result.vehicleKind).toBe("bike");
  });

  it("defaults an unrecognized or missing jobType to 'other' rather than rejecting the draft", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service", description: "Valve cleaner", cost: 4, date: today, jobType: "not-a-real-job" });
    expect(result.jobType).toBe("other");

    const result2: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service", description: "Valve cleaner", cost: 4, date: today });
    expect(result2.jobType).toBe("other");
  });

  describe("service (car-active)", () => {
    it("drafts a service entry against the car's own catalog and mileage, tagged vehicleKind: 'car'", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), {
        category: "service", description: "Full valet", cost: 40, date: today, jobType: "valet",
      });
      expect(result).toEqual({
        category: "service", jobType: "valet", jobLabel: expect.any(String),
        description: "Full valet", cost: 40, date: today, mileage: 20000, vehicleKind: "car",
      });
    });

    it("defaults an unrecognized or missing jobType to 'other' for a car too", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service", description: "Something unusual", cost: 40, date: today, jobType: "not-a-real-car-job" });
      expect(result.jobType).toBe("other");
    });

    it("still requires a description and a valid, non-future date for car service", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      expect((await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service", cost: 40, date: today }) as any).error).toMatch(/description/i);
      const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      expect((await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service", description: "Full valet", cost: 40, date: tomorrow }) as any).error).toMatch(/future/);
    });
  });

  it("drafts a bill entry with a valid billType", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), {
      category: "bill", description: "Annual renewal", cost: 300, date: today, billType: "insurance",
    });
    expect(result).toEqual({ category: "bill", billType: "insurance", billLabel: expect.any(String), description: "Annual renewal", cost: 300, date: today, vehicleKind: "bike" });
  });

  it("asks a clarifying question rather than guessing when billType is missing or invalid, since bills have no safe 'other' fallback", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "bill", description: "Annual renewal", cost: 300, date: today });
    expect(result.error).toMatch(/insurance, road tax, MOT test, or finance/);

    const result2: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "bill", description: "Annual renewal", cost: 300, date: today, billType: "not-real" });
    expect(result2.error).toMatch(/insurance, road tax, MOT test, or finance/);
  });

  describe("bill (car-active)", () => {
    it("drafts a bill entry against the car's own catalog, including a car-only bill type, tagged vehicleKind: 'car'", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), {
        category: "bill", description: "Central London trip", cost: 15, date: today, billType: "congestion",
      });
      expect(result).toEqual({ category: "bill", billType: "congestion", billLabel: expect.any(String), description: "Central London trip", cost: 15, date: today, vehicleKind: "car" });
    });

    it("asks a clarifying question rather than guessing when billType is missing or invalid, mentioning the car-only options", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "bill", description: "Annual renewal", cost: 300, date: today });
      expect(result.error).toMatch(/ULEZ\/CAZ/);
    });
  });

  it("drafts a mod/accessory entry, resolving an exact category key or label", async () => {
    const byKey: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "mod", description: "Öhlins rear shock", cost: 400, date: today, modCategory: "suspension-upgrade" });
    expect(byKey).toEqual({ category: "mod", modCategory: "suspension-upgrade", modLabel: expect.any(String), description: "Öhlins rear shock", cost: 400, date: today, mileage: 15000, vehicleKind: "bike" });

    const byLabel: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "mod", description: "Tank pads", cost: 20, date: today, modCategory: "Tank pads / protectors" });
    expect(byLabel.modCategory).toBe("tank-pads");
  });

  it("fuzzy-matches a plain-language mod category by substring, case-insensitively", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "mod", description: "Phone mount", cost: 15, date: today, modCategory: "PHONE mount" });
    expect(result.modCategory).toBe("phone-mount");
  });

  it("falls back to 'other-accessory' for a mod category with no match, rather than blocking the draft, e.g. a wax or detailing product", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "mod", description: "Szuwax detailing spray", cost: 12, date: today, modCategory: "szuwax" });
    expect(result.modCategory).toBe("other-accessory");
  });

  it("falls back to 'other-accessory' when modCategory is missing entirely", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "mod", description: "Mystery part", cost: 12, date: today });
    expect(result.modCategory).toBe("other-accessory");
  });

  describe("mod (car-active)", () => {
    it("drafts a mod entry against the car's own catalog, tagged vehicleKind: 'car'", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "mod", description: "Dash cam", cost: 90, date: today, modCategory: "dash-cam" });
      expect(result).toEqual({ category: "mod", modCategory: "dash-cam", modLabel: expect.any(String), description: "Dash cam", cost: 90, date: today, mileage: 20000, vehicleKind: "car" });
    });

    it("falls back to 'other-accessory' for an unmatched car mod category", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "mod", description: "Something unusual", cost: 12, date: today, modCategory: "not-a-real-car-mod" });
      expect(result.modCategory).toBe("other-accessory");
    });
  });

  it("drafts a fuel entry with litres, cost, and the account's current mileage - no description needed", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "fuel", cost: 15, date: today, litres: 10 });
    expect(result).toEqual({ category: "fuel", litres: 10, cost: 15, date: today, mileage: 15000, filledToFull: false, vehicleKind: "bike" });
  });

  it("only marks a fuel entry filledToFull when explicitly told true", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "fuel", cost: 15, date: today, litres: 10, filledToFull: true });
    expect(result.filledToFull).toBe(true);
  });

  it("rejects a missing, non-numeric, or non-positive litres for a fuel entry", async () => {
    expect((await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "fuel", cost: 15, date: today }) as any).error).toMatch(/litres/i);
    expect((await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "fuel", cost: 15, date: today, litres: 0 }) as any).error).toMatch(/litres/i);
    expect((await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "fuel", cost: 15, date: today, litres: -3 }) as any).error).toMatch(/litres/i);
  });

  describe("fuel (car-active)", () => {
    it("drafts a litres-based fuel entry for a non-electric car, tagged vehicleKind: 'car'", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "fuel", cost: 60, date: today, litres: 40 });
      expect(result).toEqual({ category: "fuel", litres: 40, kwh: undefined, cost: 60, date: today, mileage: 20000, filledToFull: false, vehicleKind: "car" });
    });

    it("rejects a missing litres for a non-electric car", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "fuel", cost: 60, date: today });
      expect(result.error).toMatch(/litres/i);
    });

    it("drafts a kwh-based fuel entry for an electric car, ignoring litres and never offering filledToFull", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive({ fuelType: "electric" }));
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "fuel", cost: 12, date: today, kwh: 35, filledToFull: true });
      expect(result).toEqual({ category: "fuel", litres: undefined, kwh: 35, cost: 12, date: today, mileage: 20000, filledToFull: false, vehicleKind: "car" });
    });

    it("rejects a missing kwh for an electric car, even if litres was supplied instead", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive({ fuelType: "electric" }));
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "fuel", cost: 12, date: today, litres: 40 });
      expect(result.error).toMatch(/kWh/i);
    });
  });

  // Labour is the one category available on both vehicle kinds - see
  // the top-of-file comment in assistantTools.ts for why.
  describe("labour (bike-active)", () => {
    it("drafts a labour entry, resolving an exact category key or label, tagged vehicleKind: 'bike'", async () => {
      const byKey: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), {
        category: "labour", description: "Front brake bleed", cost: 45, date: today, labourCategory: "brake-bleeding",
      });
      expect(byKey).toEqual({
        category: "labour", labourCategory: "brake-bleeding", labourLabel: expect.any(String),
        description: "Front brake bleed", cost: 45, date: today, mileage: 15000, vehicleKind: "bike",
      });
    });

    it("fuzzy-matches a plain-language labour category by substring, case-insensitively", async () => {
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "labour", description: "Bleeding the brakes", cost: 45, date: today, labourCategory: "BRAKE bleeding" });
      expect(result.labourCategory).toBe("brake-bleeding");
    });

    it("falls back to 'other' for a labour category with no match, rather than blocking the draft", async () => {
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "labour", description: "Something unusual", cost: 45, date: today, labourCategory: "not-a-real-labour-job" });
      expect(result.labourCategory).toBe("other");
    });

    it("falls back to 'other' when labourCategory is missing entirely", async () => {
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "labour", description: "Workshop time", cost: 45, date: today });
      expect(result.labourCategory).toBe("other");
    });

    it("still requires a description and a valid cost for labour, same as every other bike category", async () => {
      expect((await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "labour", cost: 45, date: today }) as any).error).toMatch(/description/i);
      expect((await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "labour", description: "Workshop time", cost: 0, date: today }) as any).error).toMatch(/cost/i);
    });
  });

  describe("labour (car-active)", () => {
    it("drafts a labour entry against the car's own catalog and mileage, tagged vehicleKind: 'car'", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), {
        category: "labour", description: "EV battery health check", cost: 60, date: today, labourCategory: "hv-battery-health-check",
      });
      expect(result).toEqual({
        category: "labour", labourCategory: "hv-battery-health-check", labourLabel: expect.any(String),
        description: "EV battery health check", cost: 60, date: today, mileage: 20000, vehicleKind: "car",
      });
    });

    it("falls back to 'other' for an unmatched car labour category", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "labour", description: "Something unusual", cost: 60, date: today, labourCategory: "not-a-real-car-labour-job" });
      expect(result.labourCategory).toBe("other");
    });

    it("still requires a description and a valid, non-future date for car labour", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      expect((await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "labour", cost: 60, date: today }) as any).error).toMatch(/description/i);
      const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      expect((await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "labour", description: "Workshop time", cost: 60, date: tomorrow }) as any).error).toMatch(/future/);
    });
  });

  // Fine and Toll carry no mileage at all (unlike every category above
  // except Bill) - the simplest drafts here, available on both vehicle
  // kinds from the start, same as Labour.
  describe("fine (bike-active)", () => {
    it("drafts a fine entry, resolving an exact category key, tagged vehicleKind: 'bike', with no mileage field", async () => {
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), {
        category: "fine", description: "Caught on a speed camera", cost: 100, date: today, fineType: "speeding",
      });
      expect(result).toEqual({
        category: "fine", fineType: "speeding", fineLabel: expect.any(String),
        description: "Caught on a speed camera", cost: 100, date: today, vehicleKind: "bike",
      });
      expect(result.mileage).toBeUndefined();
    });

    it("fuzzy-matches a plain-language fine type by substring, case-insensitively", async () => {
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "fine", description: "No lid on", cost: 50, date: today, fineType: "HELMET" });
      expect(result.fineType).toBe("no-helmet");
    });

    it("falls back to 'other' for a fine type with no match, rather than blocking the draft", async () => {
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "fine", description: "Something unusual", cost: 50, date: today, fineType: "not-a-real-fine" });
      expect(result.fineType).toBe("other");
    });

    it("falls back to 'other' when fineType is missing entirely", async () => {
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "fine", description: "Unspecified fine", cost: 50, date: today });
      expect(result.fineType).toBe("other");
    });

    it("still requires a description and a valid cost for a fine, same as every other bike category", async () => {
      expect((await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "fine", cost: 50, date: today }) as any).error).toMatch(/description/i);
      expect((await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "fine", description: "Speeding", cost: 0, date: today }) as any).error).toMatch(/cost/i);
    });
  });

  describe("toll (bike-active)", () => {
    it("drafts a toll entry, resolving an exact category key, tagged vehicleKind: 'bike', with no mileage field", async () => {
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), {
        category: "toll", description: "Outside the hospital", cost: 3.5, date: today, tollType: "parking",
      });
      expect(result).toEqual({
        category: "toll", tollType: "parking", tollLabel: expect.any(String),
        description: "Outside the hospital", cost: 3.5, date: today, vehicleKind: "bike",
      });
      expect(result.mileage).toBeUndefined();
    });

    it("falls back to 'other' for a toll type with no match, rather than blocking the draft", async () => {
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "toll", description: "Something unusual", cost: 5, date: today, tollType: "not-a-real-toll" });
      expect(result.tollType).toBe("other");
    });

    it("falls back to 'other' when tollType is missing entirely", async () => {
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "toll", description: "Unspecified charge", cost: 5, date: today });
      expect(result.tollType).toBe("other");
    });

    it("still requires a description and a valid cost for a toll, same as every other bike category", async () => {
      expect((await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "toll", cost: 5, date: today }) as any).error).toMatch(/description/i);
      expect((await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "toll", description: "Parking", cost: 0, date: today }) as any).error).toMatch(/cost/i);
    });
  });

  describe("fine (car-active)", () => {
    it("drafts a fine entry against the car's own catalog, tagged vehicleKind: 'car', with no mileage field", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), {
        category: "fine", description: "Belt not on", cost: 100, date: today, fineType: "no-seatbelt",
      });
      expect(result).toEqual({
        category: "fine", fineType: "no-seatbelt", fineLabel: expect.any(String),
        description: "Belt not on", cost: 100, date: today, vehicleKind: "car",
      });
      expect(result.mileage).toBeUndefined();
    });

    it("falls back to 'other' for an unmatched car fine type", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "fine", description: "Something unusual", cost: 100, date: today, fineType: "not-a-real-car-fine" });
      expect(result.fineType).toBe("other");
    });

    it("still requires a description and a valid, non-future date for a car fine", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      expect((await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "fine", cost: 100, date: today }) as any).error).toMatch(/description/i);
      const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      expect((await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "fine", description: "Speeding", cost: 100, date: tomorrow }) as any).error).toMatch(/future/);
    });
  });

  describe("toll (car-active)", () => {
    it("drafts a toll entry against the car's own catalog, tagged vehicleKind: 'car', with no mileage field", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), {
        category: "toll", description: "Crossing the Thames", cost: 2.5, date: today, tollType: "dartford-crossing",
      });
      expect(result).toEqual({
        category: "toll", tollType: "dartford-crossing", tollLabel: expect.any(String),
        description: "Crossing the Thames", cost: 2.5, date: today, vehicleKind: "car",
      });
      expect(result.mileage).toBeUndefined();
    });

    it("falls back to 'other' for an unmatched car toll type", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "toll", description: "Something unusual", cost: 5, date: today, tollType: "not-a-real-car-toll" });
      expect(result.tollType).toBe("other");
    });

    it("still requires a description and a valid, non-future date for a car toll", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      expect((await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "toll", cost: 5, date: today }) as any).error).toMatch(/description/i);
      const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      expect((await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "toll", description: "Parking", cost: 5, date: tomorrow }) as any).error).toMatch(/future/);
    });
  });

  // The other half of the fix: a past-dated draft should get a proper
  // date-based mileage estimate (same maths as the manual dashboard
  // forms' own useEstimatedMileage.ts), not just a hardcoded "current
  // mileage right now" regardless of how long ago the date actually was.
  describe("mileage estimation for a past date", () => {
    it("interpolates between two logged points that bracket the date, and notes that it's an estimate", async () => {
      mocks.gatherMileagePoints.mockReturnValue([
        { date: "2022-01-01", mileage: 12000 },
        { date: "2023-01-01", mileage: 13000 },
      ]);
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), {
        category: "service", description: "Oil change", cost: 40, date: "2022-07-02", jobType: "oil-filter",
      });
      expect(result.mileage).toBeGreaterThan(12000);
      expect(result.mileage).toBeLessThan(13000);
      expect(result.mileageNote).toMatch(/interpolated between logged records/);
    });

    it("does the same for a car-active session's labour draft, via gatherCarMileagePoints", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      mocks.gatherCarMileagePoints.mockReturnValue([
        { date: "2022-01-01", mileage: 17000 },
        { date: "2023-01-01", mileage: 19000 },
      ]);
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), {
        category: "labour", description: "Cambelt", cost: 200, date: "2022-07-02",
      });
      expect(result.mileage).toBeGreaterThan(17000);
      expect(result.mileage).toBeLessThan(19000);
      expect(result.mileageNote).toMatch(/interpolated between logged records/);
    });

    it("still supplies a provisional mileage, with a please-check note, rather than blocking the draft, when there's not enough history to estimate confidently", async () => {
      // Well before the bike was even added (dateAdded: 2020-01-01), with
      // no logged points at all to establish this bike's own pace from -
      // exactly the case estimateMileage refuses to guess confidently at.
      const result: any = await toolProposeLogEntry("owner@example.com", await mocks.resolveActiveVehicle(), {
        category: "service", description: "Oil change", cost: 40, date: "2010-01-01",
      });
      expect(result.mileage).toBe(8000); // bike.startingMileage - a provisional anchor, not a fabricated guess
      expect(result.mileageNote).toMatch(/before this bike was added/);
    });
  });
});

describe("toolProposeSettingsChange", () => {
  it("returns an error when the account has no vehicle at all", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    const result = await toolProposeSettingsChange("owner@example.com", await mocks.resolveActiveVehicle(), { currentMileage: 9000 });
    expect(result).toEqual({ error: "No vehicle found on this account." });
  });

  it("asks what to change when no field is given at all", async () => {
    const result: any = await toolProposeSettingsChange("owner@example.com", await mocks.resolveActiveVehicle(), {});
    expect(result.error).toMatch(/What would you like to change/);
  });

  it("drafts a mileage-only change, tagged with the bike's own vehicleKind, leaving every other field out entirely", async () => {
    const result: any = await toolProposeSettingsChange("owner@example.com", await mocks.resolveActiveVehicle(), { currentMileage: 16000 });
    expect(result).toEqual({ category: "settings", vehicleKind: "bike", currentMileage: 16000 });
  });

  it("rejects a negative mileage", async () => {
    const result: any = await toolProposeSettingsChange("owner@example.com", await mocks.resolveActiveVehicle(), { currentMileage: -5 });
    expect(result.error).toMatch(/mileage/i);
  });

  it("drafts a region change for a valid region, rejecting an invalid one", async () => {
    const ok: any = await toolProposeSettingsChange("owner@example.com", await mocks.resolveActiveVehicle(), { region: "scotland-ni" });
    expect(ok.region).toBe("scotland-ni");

    const bad: any = await toolProposeSettingsChange("owner@example.com", await mocks.resolveActiveVehicle(), { region: "mars" });
    expect(bad.error).toMatch(/Which region/);
  });

  it("rejects a zero or negative annual budget", async () => {
    expect((await toolProposeSettingsChange("owner@example.com", await mocks.resolveActiveVehicle(), { annualBudget: 0 }) as any).error).toMatch(/budget/i);
    expect((await toolProposeSettingsChange("owner@example.com", await mocks.resolveActiveVehicle(), { annualBudget: -100 }) as any).error).toMatch(/budget/i);
  });

  it("drafts a currency change for a real currency, rejecting an unrecognized one", async () => {
    const ok: any = await toolProposeSettingsChange("owner@example.com", await mocks.resolveActiveVehicle(), { currency: "EUR" });
    expect(ok.currency).toBe("EUR");

    const bad: any = await toolProposeSettingsChange("owner@example.com", await mocks.resolveActiveVehicle(), { currency: "USD" });
    expect(bad.error).toMatch(/currency/i);
  });

  it("drafts distance/fuel-economy unit changes, rejecting invalid values", async () => {
    const ok: any = await toolProposeSettingsChange("owner@example.com", await mocks.resolveActiveVehicle(), { distanceUnit: "km", fuelEconomyUnit: "l100km" });
    expect(ok.distanceUnit).toBe("km");
    expect(ok.fuelEconomyUnit).toBe("l100km");

    expect((await toolProposeSettingsChange("owner@example.com", await mocks.resolveActiveVehicle(), { distanceUnit: "furlongs" }) as any).error).toMatch(/Miles or kilometres/);
    expect((await toolProposeSettingsChange("owner@example.com", await mocks.resolveActiveVehicle(), { fuelEconomyUnit: "nope" }) as any).error).toMatch(/MPG/);
  });

  it("passes each buyer-report toggle through independently, including an explicit false", async () => {
    const result: any = await toolProposeSettingsChange("owner@example.com", await mocks.resolveActiveVehicle(), {
      includeInsuranceInReport: true, includeCleaningInReport: false,
    });
    expect(result.includeInsuranceInReport).toBe(true);
    expect(result.includeCleaningInReport).toBe(false);
    expect(result.includeFinanceInReport).toBeUndefined();
  });

  it("tags a car-active session's draft with vehicleKind: 'car'", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(carActive());
    const result: any = await toolProposeSettingsChange("owner@example.com", await mocks.resolveActiveVehicle(), { currentMileage: 41000 });
    expect(result).toEqual({ category: "settings", vehicleKind: "car", currentMileage: 41000 });
  });

  it("drafts several fields at once", async () => {
    const result: any = await toolProposeSettingsChange("owner@example.com", await mocks.resolveActiveVehicle(), { currentMileage: 16000, currency: "EUR", includeFinesInReport: true });
    expect(result).toEqual({ category: "settings", vehicleKind: "bike", currentMileage: 16000, currency: "EUR", includeFinesInReport: true });
  });
});

describe("toolProposeShareLink", () => {
  it("returns an error when the account has no vehicle at all", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    const result = await toolProposeShareLink("owner@example.com", await mocks.resolveActiveVehicle(), { recipientEmail: "buyer@example.com" });
    expect(result).toEqual({ error: "No vehicle found on this account." });
  });

  it("drafts a link with the given recipient, defaulting duration to 1month when not specified", async () => {
    const result: any = await toolProposeShareLink("owner@example.com", await mocks.resolveActiveVehicle(), { recipientEmail: "buyer@example.com" });
    expect(result).toEqual({ category: "shareLink", vehicleKind: "bike", duration: "1month", recipientEmail: "buyer@example.com", askingPrice: undefined });
  });

  it("falls back to 1month for an invalid duration rather than rejecting the draft", async () => {
    const result: any = await toolProposeShareLink("owner@example.com", await mocks.resolveActiveVehicle(), { recipientEmail: "buyer@example.com", duration: "1year" });
    expect(result.duration).toBe("1month");
  });

  it("accepts a real duration", async () => {
    const result: any = await toolProposeShareLink("owner@example.com", await mocks.resolveActiveVehicle(), { recipientEmail: "buyer@example.com", duration: "6months" });
    expect(result.duration).toBe("6months");
  });

  it("leaves recipientEmail blank (never invented) when not given, for the draft card to require before confirming", async () => {
    const result: any = await toolProposeShareLink("owner@example.com", await mocks.resolveActiveVehicle(), {});
    expect(result.recipientEmail).toBe("");
  });

  it("rejects a zero or negative asking price", async () => {
    expect((await toolProposeShareLink("owner@example.com", await mocks.resolveActiveVehicle(), { recipientEmail: "buyer@example.com", askingPrice: 0 }) as any).error).toMatch(/asking price/i);
    expect((await toolProposeShareLink("owner@example.com", await mocks.resolveActiveVehicle(), { recipientEmail: "buyer@example.com", askingPrice: -10 }) as any).error).toMatch(/asking price/i);
  });

  it("carries a valid asking price through", async () => {
    const result: any = await toolProposeShareLink("owner@example.com", await mocks.resolveActiveVehicle(), { recipientEmail: "buyer@example.com", askingPrice: 3200 });
    expect(result.askingPrice).toBe(3200);
  });

  it("tags a car-active session's draft with vehicleKind: 'car'", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(carActive());
    const result: any = await toolProposeShareLink("owner@example.com", await mocks.resolveActiveVehicle(), { recipientEmail: "buyer@example.com" });
    expect(result.vehicleKind).toBe("car");
  });
});

describe("toolProposeEditEntry", () => {
  const today = new Date().toISOString().slice(0, 10);

  it("returns an error when the account has no vehicle at all", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    const result = await toolProposeEditEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service", entryId: "sr-1" });
    expect(result).toEqual({ error: "No vehicle found on this account." });
  });

  it("rejects a genuinely unrecognized category rather than guessing", async () => {
    const result: any = await toolProposeEditEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "not-a-real-category", entryId: "sr-1" } as any);
    expect(result.error).toMatch(/Not sure what category/);
  });

  it("requires a real entryId", async () => {
    const result: any = await toolProposeEditEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service" });
    expect(result.error).toMatch(/Which entry/);
  });

  it("rejects a non-positive cost when one is given", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ id: "sr-1", jobType: "oil-filter", cost: 40, mileage: 12000, notes: "", date: "2025-01-01" }]);
    const result: any = await toolProposeEditEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service", entryId: "sr-1", cost: 0 });
    expect(result.error).toMatch(/cost/i);
  });

  it("rejects a negative mileage when one is given", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ id: "sr-1", jobType: "oil-filter", cost: 40, mileage: 12000, notes: "", date: "2025-01-01" }]);
    const result: any = await toolProposeEditEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service", entryId: "sr-1", mileage: -5 });
    expect(result.error).toMatch(/mileage/i);
  });

  describe("service", () => {
    const record = { id: "sr-1", jobType: "oil-filter", cost: 40, mileage: 12000, notes: "Done at Halfords", date: "2025-06-01" };

    it("returns an error when the entryId doesn't match any real record", async () => {
      mocks.getServiceRecords.mockResolvedValue([record]);
      const result: any = await toolProposeEditEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service", entryId: "not-real", cost: 50 });
      expect(result.error).toMatch(/Couldn't find that service record/);
    });

    it("changes only the given field, keeping every other field at its current logged value", async () => {
      mocks.getServiceRecords.mockResolvedValue([record]);
      const result: any = await toolProposeEditEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service", entryId: "sr-1", cost: 55 });
      expect(result).toEqual({
        category: "service", jobType: "oil-filter", jobLabel: expect.any(String),
        description: "Done at Halfords", cost: 55, date: "2025-06-01", mileage: 12000,
        vehicleKind: "bike", entryId: "sr-1",
      });
    });

    it("falls back to the record's own current jobType for an unrecognized new one, rather than defaulting to 'other'", async () => {
      mocks.getServiceRecords.mockResolvedValue([record]);
      const result: any = await toolProposeEditEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service", entryId: "sr-1", jobType: "not-a-real-job" });
      expect(result.jobType).toBe("oil-filter");
    });

    it("changes jobType, description, cost, date, and mileage together", async () => {
      mocks.getServiceRecords.mockResolvedValue([record]);
      const result: any = await toolProposeEditEntry("owner@example.com", await mocks.resolveActiveVehicle(), {
        category: "service", entryId: "sr-1", jobType: "valet", description: "Full valet instead", cost: 60, date: today, mileage: 13000,
      });
      expect(result).toMatchObject({ jobType: "valet", description: "Full valet instead", cost: 60, date: today, mileage: 13000 });
    });

    it("rejects a future date", async () => {
      mocks.getServiceRecords.mockResolvedValue([record]);
      const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      const result: any = await toolProposeEditEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service", entryId: "sr-1", date: tomorrow });
      expect(result.error).toMatch(/future/);
    });

    it("rejects an unparseable date", async () => {
      mocks.getServiceRecords.mockResolvedValue([record]);
      const result: any = await toolProposeEditEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service", entryId: "sr-1", date: "not-a-date" });
      expect(result.error).toMatch(/valid date/);
    });

    it("looks up against the car's own catalog and records for a car-active session, tagged vehicleKind: 'car'", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      mocks.getCarServiceRecords.mockResolvedValue([{ id: "csr-1", jobType: "valet", cost: 40, mileage: 32000, notes: "", date: "2025-06-01" }]);
      const result: any = await toolProposeEditEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "service", entryId: "csr-1", cost: 45 });
      expect(result.vehicleKind).toBe("car");
      expect(result.cost).toBe(45);
      expect(mocks.getServiceRecords).not.toHaveBeenCalled();
    });
  });

  describe("bill", () => {
    it("changes only the given field for a bike bill", async () => {
      mocks.getBills.mockResolvedValue([{ id: "b-1", billType: "insurance", cost: 300, notes: "Annual renewal", date: "2025-01-01" }]);
      const result: any = await toolProposeEditEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "bill", entryId: "b-1", cost: 320 });
      expect(result).toEqual({
        category: "bill", billType: "insurance", billLabel: expect.any(String),
        description: "Annual renewal", cost: 320, date: "2025-01-01", vehicleKind: "bike", entryId: "b-1",
      });
    });

    it("returns an error when the entryId doesn't match any real bill", async () => {
      mocks.getBills.mockResolvedValue([]);
      const result: any = await toolProposeEditEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "bill", entryId: "b-1", cost: 320 });
      expect(result.error).toMatch(/Couldn't find that bill/);
    });

    it("resolves against the car-only bill catalog for a car-active session", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      mocks.getCarBills.mockResolvedValue([{ id: "cb-1", billType: "congestion", cost: 15, notes: "", date: "2025-01-01" }]);
      const result: any = await toolProposeEditEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "bill", entryId: "cb-1", billType: "ulez-caz" });
      expect(result.billType).toBe("ulez-caz");
      expect(result.vehicleKind).toBe("car");
    });
  });

  describe("mod", () => {
    it("changes only the given field, defaulting the description to the mod's own name", async () => {
      mocks.getMods.mockResolvedValue([{ id: "m-1", category: "tank-pads", name: "Tank pads", cost: 20, mileage: 12000, date: "2025-01-01" }]);
      const result: any = await toolProposeEditEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "mod", entryId: "m-1", cost: 25 });
      expect(result).toEqual({
        category: "mod", modCategory: "tank-pads", modLabel: expect.any(String),
        description: "Tank pads", cost: 25, date: "2025-01-01", mileage: 12000, vehicleKind: "bike", entryId: "m-1",
      });
    });

    it("returns an error when the entryId doesn't match any real mod", async () => {
      mocks.getMods.mockResolvedValue([]);
      const result: any = await toolProposeEditEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "mod", entryId: "m-1" });
      expect(result.error).toMatch(/Couldn't find that modification/);
    });
  });

  describe("fuel", () => {
    it("changes only the given field on a bike (litres) entry, never touching kwh", async () => {
      mocks.getFuelLogs.mockResolvedValue([{ id: "f-1", litres: 10, cost: 15, mileage: 12000, date: "2025-01-01", filledToFull: true }]);
      const result: any = await toolProposeEditEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "fuel", entryId: "f-1", cost: 16 });
      expect(result).toEqual({
        category: "fuel", litres: 10, kwh: undefined, cost: 16, date: "2025-01-01", mileage: 12000,
        filledToFull: true, vehicleKind: "bike", entryId: "f-1",
      });
    });

    it("keeps a car entry on kwh (never falls back to litres) when it was originally a charging session", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      mocks.getCarFuelLogs.mockResolvedValue([{ id: "cf-1", kwh: 30, cost: 10, mileage: 32000, date: "2025-01-01" }]);
      const result: any = await toolProposeEditEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "fuel", entryId: "cf-1", cost: 11, litres: 40 });
      expect(result.kwh).toBe(30);
      expect(result.litres).toBeUndefined();
      expect(result.cost).toBe(11);
      expect(result.filledToFull).toBe(false);
    });

    it("returns an error when the entryId doesn't match any real fuel entry", async () => {
      mocks.getFuelLogs.mockResolvedValue([]);
      const result: any = await toolProposeEditEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "fuel", entryId: "f-1" });
      expect(result.error).toMatch(/Couldn't find that fuel\/charging entry/);
    });
  });

  describe("labour", () => {
    it("changes only the given field", async () => {
      mocks.getLabour.mockResolvedValue([{ id: "l-1", category: "brake-bleeding", cost: 45, mileage: 12000, notes: "Front brakes", date: "2025-01-01" }]);
      const result: any = await toolProposeEditEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "labour", entryId: "l-1", cost: 50 });
      expect(result).toEqual({
        category: "labour", labourCategory: "brake-bleeding", labourLabel: expect.any(String),
        description: "Front brakes", cost: 50, date: "2025-01-01", mileage: 12000, vehicleKind: "bike", entryId: "l-1",
      });
    });
  });

  describe("fine", () => {
    it("changes only the given field, with no mileage field at all", async () => {
      mocks.getFines.mockResolvedValue([{ id: "fn-1", fineType: "speeding", cost: 100, notes: "M25", date: "2025-01-01" }]);
      const result: any = await toolProposeEditEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "fine", entryId: "fn-1", cost: 110 });
      expect(result).toEqual({
        category: "fine", fineType: "speeding", fineLabel: expect.any(String),
        description: "M25", cost: 110, date: "2025-01-01", vehicleKind: "bike", entryId: "fn-1",
      });
      expect(result.mileage).toBeUndefined();
    });
  });

  describe("toll", () => {
    it("changes only the given field, with no mileage field at all", async () => {
      mocks.getTolls.mockResolvedValue([{ id: "t-1", tollType: "parking", cost: 4, notes: "", date: "2025-01-01" }]);
      const result: any = await toolProposeEditEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "toll", entryId: "t-1", cost: 5 });
      expect(result).toEqual({
        category: "toll", tollType: "parking", tollLabel: expect.any(String),
        description: "", cost: 5, date: "2025-01-01", vehicleKind: "bike", entryId: "t-1",
      });
    });

    it("returns an error when the entryId doesn't match any real toll", async () => {
      mocks.getTolls.mockResolvedValue([]);
      const result: any = await toolProposeEditEntry("owner@example.com", await mocks.resolveActiveVehicle(), { category: "toll", entryId: "t-1" });
      expect(result.error).toMatch(/Couldn't find that toll/);
    });
  });
});

describe("toolProposeVaultDocument", () => {
  it("returns an error when the account has no vehicle at all", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    const result = await toolProposeVaultDocument("owner@example.com", await mocks.resolveActiveVehicle(), {});
    expect(result).toEqual({ error: "No vehicle found on this account." });
  });

  it("drafts against the bike's own id, with an empty category/label when none was given", async () => {
    const result: any = await toolProposeVaultDocument("owner@example.com", await mocks.resolveActiveVehicle(), {});
    expect(result).toEqual({ category: "vaultDocument", vehicleKind: "bike", vehicleId: "bike-1", vaultCategory: "", label: "" });
  });

  it("accepts a real Vault category and trims a given label", async () => {
    const result: any = await toolProposeVaultDocument("owner@example.com", await mocks.resolveActiveVehicle(), { category: "dvlaLegal", label: "  V5C  " });
    expect(result.vaultCategory).toBe("dvlaLegal");
    expect(result.label).toBe("V5C");
  });

  it("falls back to an empty category for an unrecognized one, rather than rejecting the draft", async () => {
    const result: any = await toolProposeVaultDocument("owner@example.com", await mocks.resolveActiveVehicle(), { category: "not-a-real-vault-category" });
    expect(result.vaultCategory).toBe("");
  });

  it("drafts against the car's own id for a car-active session", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(carActive());
    const result: any = await toolProposeVaultDocument("owner@example.com", await mocks.resolveActiveVehicle(), { category: "insurance" });
    expect(result).toEqual({ category: "vaultDocument", vehicleKind: "car", vehicleId: "car-1", vaultCategory: "insurance", label: "" });
  });
});

describe("toolProposeFeedback", () => {
  // The one propose* tool that is genuinely account-level, not
  // vehicle-level - it must never touch resolveActiveVehicle at all,
  // unlike every other tool in this file.
  it("never resolves a vehicle - feedback is account-level, not vehicle-level", async () => {
    await toolProposeFeedback({ feedbackType: "bug", message: "The chart is blank" });
    expect(mocks.resolveActiveVehicle).not.toHaveBeenCalled();
  });

  it("rejects a missing or unrecognized feedbackType", async () => {
    expect(await toolProposeFeedback({ message: "hi" })).toEqual({ error: "Is this a feature request, a bug report, or something else?" });
    expect(await toolProposeFeedback({ feedbackType: "nonsense", message: "hi" })).toEqual({ error: "Is this a feature request, a bug report, or something else?" });
  });

  it("rejects a missing or empty message", async () => {
    expect(await toolProposeFeedback({ feedbackType: "bug" })).toEqual({ error: "What would you like to say? A sentence or two is enough." });
    expect(await toolProposeFeedback({ feedbackType: "bug", message: "   " })).toEqual({ error: "What would you like to say? A sentence or two is enough." });
  });

  it("rejects an overlong message", async () => {
    const result = await toolProposeFeedback({ feedbackType: "feature", message: "x".repeat(4001) });
    expect(result).toEqual({ error: "That's a bit long - could you shorten it to under 4000 characters?" });
  });

  it("drafts a valid feature request, trimmed", async () => {
    const result = await toolProposeFeedback({ feedbackType: "feature", message: "  Add dark mode  " });
    expect(result).toEqual({ category: "feedback", feedbackType: "feature", message: "Add dark mode" });
  });

  it("drafts a valid bug report", async () => {
    const result = await toolProposeFeedback({ feedbackType: "bug", message: "The spend chart shows nothing" });
    expect(result).toEqual({ category: "feedback", feedbackType: "bug", message: "The spend chart shows nothing" });
  });
});

describe("runAssistantTool - attachment merging", () => {
  // withAttachment isn't exported directly - exercised here through the
  // one real dispatch path that uses it, same as every other piece of
  // this file's own security-dispatch behaviour.
  const today = new Date().toISOString().slice(0, 10);
  const attachment = { blobName: "abc123.jpg", fileName: "receipt.jpg", fileType: "image/jpeg" as const, uploadedAt: "2026-01-01T00:00:00.000Z" };

  it("merges the given attachment onto a successful proposeLogEntry draft", async () => {
    const result: any = await runAssistantTool(
      "proposeLogEntry",
      { category: "service", description: "Oil change", cost: 40, date: today, jobType: "oil-filter" },
      "owner@example.com",
      await mocks.resolveActiveVehicle(),
      undefined,
      undefined,
      attachment
    );
    expect(result.attachment).toEqual(attachment);
  });

  it("never attaches anything when none was given this turn", async () => {
    const result: any = await runAssistantTool(
      "proposeLogEntry",
      { category: "service", description: "Oil change", cost: 40, date: today, jobType: "oil-filter" },
      "owner@example.com",
      await mocks.resolveActiveVehicle()
    );
    expect(result.attachment).toBeUndefined();
  });

  it("never attaches anything onto an error result", async () => {
    const result: any = await runAssistantTool(
      "proposeLogEntry",
      { category: "service", description: "Oil change", cost: -5, date: today },
      "owner@example.com",
      await mocks.resolveActiveVehicle(),
      undefined,
      undefined,
      attachment
    );
    expect(result.error).toBeDefined();
    expect(result.attachment).toBeUndefined();
  });

  it("merges the given attachment onto a successful proposeEditEntry draft too", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ id: "sr-1", jobType: "oil-filter", cost: 40, mileage: 12000, notes: "", date: "2025-01-01" }]);
    const result: any = await runAssistantTool(
      "proposeEditEntry",
      { category: "service", entryId: "sr-1", cost: 45 },
      "owner@example.com",
      await mocks.resolveActiveVehicle(),
      undefined,
      undefined,
      attachment
    );
    expect(result.attachment).toEqual(attachment);
  });

  it("never attaches anything onto an unrelated tool's result (e.g. proposeSettingsChange)", async () => {
    const result: any = await runAssistantTool(
      "proposeSettingsChange",
      { currentMileage: 16000 },
      "owner@example.com",
      await mocks.resolveActiveVehicle(),
      undefined,
      undefined,
      attachment
    );
    expect(result.attachment).toBeUndefined();
  });
});
