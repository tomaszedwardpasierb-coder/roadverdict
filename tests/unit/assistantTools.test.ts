import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveActiveVehicle: vi.fn(),
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
}));

// resolveActiveVehicle (activeVehicle.ts) is the one boundary every tool
// below actually calls now - mocked directly here rather than mocking
// the bike.ts/car.ts/next-headers functions it's built on internally,
// same "mock at the boundary the code under test directly calls"
// convention used throughout this suite.
vi.mock("@/lib/tracker/activeVehicle", () => ({ resolveActiveVehicle: mocks.resolveActiveVehicle }));
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
  ASSISTANT_TOOL_DECLARATIONS,
} from "@/lib/tracker/assistantTools";

const bike = {
  id: "bike-1",
  currentMileage: 15000,
  currency: "GBP",
  annualBudget: null as number | null,
  startingMileage: 8000,
  dateAdded: "2020-01-01",
};
const car = {
  id: "car-1",
  currentMileage: 20000,
  currency: "GBP",
  annualBudget: null as number | null,
  fuelType: "petrol" as "petrol" | "diesel" | "hybrid" | "phev" | "electric",
  startingMileage: 10000,
  dateAdded: "2020-01-01",
};

function bikeActive(overrides: Partial<typeof bike> = {}) {
  return { kind: "bike" as const, bike: { ...bike, ...overrides }, hasAnyCar: false };
}
function carActive(overrides: Partial<typeof car> = {}) {
  return { kind: "car" as const, car: { ...car, ...overrides }, hasAnyBike: false };
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.resolveActiveVehicle.mockResolvedValue(bikeActive());
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
    expect(mocks.resolveActiveVehicle).toHaveBeenCalledWith("real-owner@example.com");
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
    expect(await toolGetSpendTotal("owner@example.com", {})).toEqual({ error: "No vehicle found on this account." });
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

  describe("car-active session", () => {
    beforeEach(() => mocks.resolveActiveVehicle.mockResolvedValue(carActive()));

    it("uses the car's own doc fetches, not the bike ones", async () => {
      mocks.getCarServiceRecords.mockResolvedValue([{ date: "2025-01-01", cost: 100 }]);
      mocks.getCarFuelLogs.mockResolvedValue([{ date: "2025-01-01", cost: 50 }]);
      const result: any = await toolGetSpendTotal("owner@example.com", {});
      expect(result.total).toBe(150);
      expect(mocks.getServiceRecords).not.toHaveBeenCalled();
      expect(mocks.getFuelLogs).not.toHaveBeenCalled();
    });
  });
});

describe("toolGetEntries", () => {
  it("refuses to run without a date or a range, rather than dumping the whole history", async () => {
    const result = await toolGetEntries("owner@example.com", {});
    expect(result).toEqual({ error: "Needs a date, or a start/end range, to look up - which day, or which period?" });
  });

  it("returns an error when the account has no vehicle at all", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    const result = await toolGetEntries("owner@example.com", { date: "2025-01-01" });
    expect(result).toEqual({ error: "No vehicle found on this account." });
  });

  it("lists the individual entries for a single day, across every category, with a real description each", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ date: "2026-01-05", cost: 12.78, jobType: "oil-filter", notes: "" }]);
    mocks.getFuelLogs.mockResolvedValue([{ date: "2025-01-01", cost: 20, litres: 10, filledToFull: false }]); // different day, excluded

    const result: any = await toolGetEntries("owner@example.com", { date: "2026-01-05" });

    expect(result.entries).toEqual([
      { date: "2026-01-05", category: "service", description: "Oil & filter change", cost: 12.78 },
    ]);
    expect(result.entryCount).toBe(1);
    expect(result.totalCost).toBe(12.78);
  });

  it("appends notes to the category label rather than replacing it", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ date: "2026-01-05", cost: 40, jobType: "oil-filter", notes: "done at Halfords" }]);
    const result: any = await toolGetEntries("owner@example.com", { date: "2026-01-05" });
    expect(result.entries[0].description).toBe("Oil & filter change - done at Halfords");
  });

  it("describes a fuel entry with litres and a full-tank note, since fuel logs have no description field at all", async () => {
    mocks.getFuelLogs.mockResolvedValue([{ date: "2026-01-05", cost: 15, litres: 10, filledToFull: true }]);
    const result: any = await toolGetEntries("owner@example.com", { date: "2026-01-05" });
    expect(result.entries[0]).toEqual({ date: "2026-01-05", category: "fuel", description: "Fuel fill-up - 10L (full tank)", cost: 15 });
  });

  it("describes a mod entry with its resolved category label and its own name", async () => {
    mocks.getMods.mockResolvedValue([{ date: "2026-01-05", cost: 12, category: "other-accessory", name: "Szuwax detailing spray", notes: "" }]);
    const result: any = await toolGetEntries("owner@example.com", { date: "2026-01-05" });
    expect(result.entries[0].description).toBe("Other accessory - Szuwax detailing spray");
  });

  it("describes a bill entry with its resolved bill-type label", async () => {
    mocks.getBills.mockResolvedValue([{ date: "2026-01-05", cost: 300, billType: "insurance", notes: "" }]);
    const result: any = await toolGetEntries("owner@example.com", { date: "2026-01-05" });
    expect(result.entries[0].description).toBe("Insurance");
  });

  it("filters to a single category when specified", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ date: "2026-01-05", cost: 40, jobType: "oil-filter", notes: "" }]);
    mocks.getFuelLogs.mockResolvedValue([{ date: "2026-01-05", cost: 15, litres: 10, filledToFull: false }]);
    const result: any = await toolGetEntries("owner@example.com", { date: "2026-01-05", category: "fuel" });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].category).toBe("fuel");
  });

  it("filters by an inclusive start/end range", async () => {
    mocks.getServiceRecords.mockResolvedValue([
      { date: "2024-06-01", cost: 100, jobType: "other", notes: "" }, // before range
      { date: "2025-06-01", cost: 50, jobType: "other", notes: "" },  // in range
    ]);
    const result: any = await toolGetEntries("owner@example.com", { startDate: "2025-01-01", endDate: "2025-12-31" });
    expect(result.entryCount).toBe(1);
    expect(result.entries[0].date).toBe("2025-06-01");
  });

  it("sorts entries chronologically regardless of category fetch order", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ date: "2026-01-10", cost: 40, jobType: "other", notes: "" }]);
    mocks.getFuelLogs.mockResolvedValue([{ date: "2026-01-01", cost: 15, litres: 10, filledToFull: false }]);
    const result: any = await toolGetEntries("owner@example.com", { startDate: "2026-01-01", endDate: "2026-01-31" });
    expect(result.entries.map((e: any) => e.date)).toEqual(["2026-01-01", "2026-01-10"]);
  });

  it("returns a plain empty result with a note, rather than an error, when nothing matches", async () => {
    const result: any = await toolGetEntries("owner@example.com", { date: "2026-01-05" });
    expect(result).toEqual({ entries: [], entryCount: 0, totalCost: 0, currency: "GBP", note: "Nothing logged in that range." });
  });

  describe("car-active session", () => {
    beforeEach(() => mocks.resolveActiveVehicle.mockResolvedValue(carActive()));

    it("uses the car's own doc fetches and car job/bill/mod labels, not the bike ones", async () => {
      mocks.getCarServiceRecords.mockResolvedValue([{ date: "2026-01-05", cost: 40, jobType: "oil-filter", notes: "" }]);
      const result: any = await toolGetEntries("owner@example.com", { date: "2026-01-05" });
      expect(result.entries[0].category).toBe("service");
      expect(mocks.getServiceRecords).not.toHaveBeenCalled();
    });

    it("describes a litres-based car fuel entry the same way as a bike's", async () => {
      mocks.getCarFuelLogs.mockResolvedValue([{ date: "2026-01-05", cost: 15, litres: 10, filledToFull: true }]);
      const result: any = await toolGetEntries("owner@example.com", { date: "2026-01-05" });
      expect(result.entries[0].description).toBe("Fuel fill-up - 10L (full tank)");
    });

    it("describes a kWh-based car charging entry, not litres", async () => {
      mocks.getCarFuelLogs.mockResolvedValue([{ date: "2026-01-05", cost: 8, kwh: 22 }]);
      const result: any = await toolGetEntries("owner@example.com", { date: "2026-01-05" });
      expect(result.entries[0].description).toBe("Charge - 22kWh");
    });

    it("resolves a car-only bill type (e.g. congestion charge) that has no bike equivalent", async () => {
      mocks.getCarBills.mockResolvedValue([{ date: "2026-01-05", cost: 15, billType: "congestion", notes: "" }]);
      const result: any = await toolGetEntries("owner@example.com", { date: "2026-01-05" });
      expect(result.entries[0].description).toMatch(/congestion/i);
    });
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

  it("returns an error when the account has no vehicle at all", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    expect(await toolGetMileage("owner@example.com", {})).toEqual({ error: "No vehicle found on this account." });
  });

  describe("car-active session", () => {
    beforeEach(() => mocks.resolveActiveVehicle.mockResolvedValue(carActive()));

    it("returns the car's own current mileage, via gatherCarMileagePoints not gatherMileagePoints", async () => {
      expect(await toolGetMileage("owner@example.com", {})).toEqual({ mileage: 20000, asOf: "current" });

      mocks.gatherCarMileagePoints.mockReturnValue([{ date: "2025-06-01", mileage: 18000 }]);
      const result: any = await toolGetMileage("owner@example.com", { atDate: "2025-06-01" });
      expect(result.mileage).toBe(18000);
      expect(mocks.gatherMileagePoints).not.toHaveBeenCalled();
    });
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

  it("returns an error when the account has no vehicle at all", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    expect(await toolGetMpgTrend("owner@example.com")).toEqual({ error: "No vehicle found on this account." });
  });

  describe("car-active session", () => {
    it("reports MPG doesn't apply for an electric car, without touching the litres-based mpg calc at all", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive({ fuelType: "electric" }));
      const result: any = await toolGetMpgTrend("owner@example.com");
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
      const result: any = await toolGetMpgTrend("owner@example.com");
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

    const result: any = await toolGetReminders("owner@example.com");

    expect(result.upcoming).toHaveLength(1);
    expect(result.upcoming[0].name).toBe("MOT");
    expect(result.overdue).toHaveLength(1);
  });

  it("returns an error when the account has no vehicle at all", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    expect(await toolGetReminders("owner@example.com")).toEqual({ error: "No vehicle found on this account." });
  });

  describe("car-active session", () => {
    beforeEach(() => mocks.resolveActiveVehicle.mockResolvedValue(carActive()));

    it("uses computeCarReminderStatus/carReminderDetailLabel, not the bike versions", async () => {
      mocks.getCarReminders.mockResolvedValue([{ name: "MOT renewal" }]);
      mocks.computeCarReminderStatus.mockReturnValue("overdue");
      mocks.carReminderDetailLabel.mockReturnValue("overdue since 1 Jun 2026");

      const result: any = await toolGetReminders("owner@example.com");

      expect(result.overdue).toHaveLength(1);
      expect(mocks.computeReminderStatus).not.toHaveBeenCalled();
      expect(mocks.getReminders).not.toHaveBeenCalled();
    });
  });
});

describe("toolGetBudgetProgress", () => {
  it("reports no budget when none is set, without attempting to compute spend", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(bikeActive({ annualBudget: null }));
    expect(await toolGetBudgetProgress("owner@example.com")).toEqual({ hasBudget: false });
    expect(mocks.getServiceRecords).not.toHaveBeenCalled();
  });

  it("only counts spend from the current calendar year toward budget progress", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(bikeActive({ annualBudget: 1000 }));
    mocks.getServiceRecords.mockResolvedValue([
      { date: "2020-01-01", cost: 500 }, // a past year, must not count
      { date: `${new Date().getFullYear()}-01-01`, cost: 200 },
    ]);
    const result: any = await toolGetBudgetProgress("owner@example.com");
    expect(result.spentThisYear).toBe(200);
    expect(result.remaining).toBe(800);
  });

  it("returns an error when the account has no vehicle at all", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    expect(await toolGetBudgetProgress("owner@example.com")).toEqual({ error: "No vehicle found on this account." });
  });

  describe("car-active session", () => {
    it("reports no budget when the car has none set, without fetching any car records", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive({ annualBudget: null }));
      expect(await toolGetBudgetProgress("owner@example.com")).toEqual({ hasBudget: false });
      expect(mocks.getCarServiceRecords).not.toHaveBeenCalled();
    });

    it("computes the car's own year-to-date spend against its own budget", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive({ annualBudget: 1000 }));
      mocks.getCarServiceRecords.mockResolvedValue([{ date: `${new Date().getFullYear()}-01-01`, cost: 300 }]);
      const result: any = await toolGetBudgetProgress("owner@example.com");
      expect(result.spentThisYear).toBe(300);
      expect(result.remaining).toBe(700);
      expect(mocks.getServiceRecords).not.toHaveBeenCalled();
    });
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

  it("returns an error when the account has no vehicle at all", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    expect(await toolGetLastLoggedJob("owner@example.com", { jobQuery: "oil" })).toEqual({ error: "No vehicle found on this account." });
  });

  describe("car-active session", () => {
    beforeEach(() => mocks.resolveActiveVehicle.mockResolvedValue(carActive()));

    it("looks up the car's own service records via car job labels, not the bike ones", async () => {
      mocks.getCarServiceRecords.mockResolvedValue([{ jobType: "oil-filter", date: "2025-01-01", mileage: 5000, cost: 40 }]);
      const result: any = await toolGetLastLoggedJob("owner@example.com", { jobQuery: "oil" });
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

  it("returns an error when the account has no vehicle at all", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    expect(await toolGetShareLinks("owner@example.com")).toEqual({ error: "No vehicle found on this account." });
  });

  describe("car-active session", () => {
    beforeEach(() => mocks.resolveActiveVehicle.mockResolvedValue(carActive()));

    it("filters links down to the active car only, via the car-specific lookups, not the bike ones", async () => {
      mocks.getCarShareLinksForUser.mockResolvedValue([
        { carId: "car-1", recipientEmail: "buyer@example.com", createdAt: "2025-01-01" },
        { carId: "some-other-car", recipientEmail: "x@example.com", createdAt: "2025-01-01" },
      ]);
      const result: any = await toolGetShareLinks("owner@example.com");
      expect(result.activeLinkCount).toBe(1);
      expect(mocks.getShareLinksForUser).not.toHaveBeenCalled();
      expect(mocks.getPendingReceiptRequestsForOwner).not.toHaveBeenCalled();
    });

    it("still reports the pending receipt-request count for the car even when there are no active links", async () => {
      mocks.getPendingCarReceiptRequestsForOwner.mockResolvedValue([{ carId: "car-1" }]);
      const result: any = await toolGetShareLinks("owner@example.com");
      expect(result).toEqual({ hasActiveLinks: false, pendingReceiptRequestCount: 1 });
    });
  });
});

describe("toolGetStorySoFar", () => {
  it("gives clear guidance when no story has been generated yet, rather than an empty result", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(bikeActive({ storyCache: undefined } as any));
    const result: any = await toolGetStorySoFar("owner@example.com");
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
    const result: any = await toolGetStorySoFar("owner@example.com");
    expect(result).toMatchObject({ hasStory: true, story: ["A good bike."], ownerOnlyNotes: ["Log more receipts."] });
  });

  it("returns an error when the account has no vehicle at all", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    expect(await toolGetStorySoFar("owner@example.com")).toEqual({ error: "No vehicle found on this account." });
  });

  describe("car-active session", () => {
    it("gives clear guidance when no story has been generated yet for the car, rather than an empty result", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive({ storyCache: undefined } as any));
      const result: any = await toolGetStorySoFar("owner@example.com");
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
      const result: any = await toolGetStorySoFar("owner@example.com");
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
    const result = await toolProposeLogEntry("owner@example.com", { category: "service", description: "Oil", cost: 20 });
    expect(result).toEqual({ error: "No vehicle found on this account." });
  });

  it("is not available for a car-active session's non-labour categories, and never reaches any cost/description/date validation", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(carActive());
    const result: any = await toolProposeLogEntry("owner@example.com", { category: "service", description: "Oil", cost: 20 });
    expect(result.error).toMatch(/only available for Labour/i);
  });

  it("rejects a genuinely unrecognized category rather than guessing", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", { category: "not-a-real-category", description: "Petrol", cost: 20 } as any);
    expect(result.error).toMatch(/Not sure what category/);
  });

  it("rejects a missing description", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", { category: "service", cost: 20, date: today });
    expect(result.error).toMatch(/description/i);
  });

  it("rejects a blank/whitespace-only description", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", { category: "service", description: "   ", cost: 20, date: today });
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

  // The actual fix this whole block exercises: a chat-drafted entry must
  // ask for a date, exactly like the manual dashboard forms' own
  // required date field - never silently assume today, since AI chat
  // was previously the one place in the app doing that.
  it("asks for the date, rather than silently defaulting to today, when none is given or the given one is unparseable", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", { category: "service", description: "Oil", cost: 20 });
    expect(result.error).toMatch(/what date/i);
    expect(result.date).toBeUndefined();

    const result2: any = await toolProposeLogEntry("owner@example.com", { category: "service", description: "Oil", cost: 20, date: "not-a-date" });
    expect(result2.error).toMatch(/what date/i);
  });

  it("asks for the date on a car-active session too, once past the labour-only/cost gate", async () => {
    mocks.resolveActiveVehicle.mockResolvedValue(carActive());
    const result: any = await toolProposeLogEntry("owner@example.com", { category: "labour", description: "Cambelt", cost: 60 });
    expect(result.error).toMatch(/what date/i);
  });

  it("drafts a service entry with the recognized jobType and the account's current mileage", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", {
      category: "service", description: "Valve cleaner", cost: 4, date: today, jobType: "oil-filter",
    });
    expect(result).toEqual({
      category: "service", jobType: "oil-filter", jobLabel: expect.any(String),
      description: "Valve cleaner", cost: 4, date: today, mileage: 15000,
    });
    expect(result.mileageNote).toBeUndefined(); // today needs no estimate - it's just the current mileage
  });

  it("defaults an unrecognized or missing jobType to 'other' rather than rejecting the draft", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", { category: "service", description: "Valve cleaner", cost: 4, date: today, jobType: "not-a-real-job" });
    expect(result.jobType).toBe("other");

    const result2: any = await toolProposeLogEntry("owner@example.com", { category: "service", description: "Valve cleaner", cost: 4, date: today });
    expect(result2.jobType).toBe("other");
  });

  it("drafts a bill entry with a valid billType", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", {
      category: "bill", description: "Annual renewal", cost: 300, date: today, billType: "insurance",
    });
    expect(result).toEqual({ category: "bill", billType: "insurance", billLabel: expect.any(String), description: "Annual renewal", cost: 300, date: today });
  });

  it("asks a clarifying question rather than guessing when billType is missing or invalid, since bills have no safe 'other' fallback", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", { category: "bill", description: "Annual renewal", cost: 300, date: today });
    expect(result.error).toMatch(/insurance, road tax, MOT test, or finance/);

    const result2: any = await toolProposeLogEntry("owner@example.com", { category: "bill", description: "Annual renewal", cost: 300, date: today, billType: "not-real" });
    expect(result2.error).toMatch(/insurance, road tax, MOT test, or finance/);
  });

  it("drafts a mod/accessory entry, resolving an exact category key or label", async () => {
    const byKey: any = await toolProposeLogEntry("owner@example.com", { category: "mod", description: "Öhlins rear shock", cost: 400, date: today, modCategory: "suspension-upgrade" });
    expect(byKey).toEqual({ category: "mod", modCategory: "suspension-upgrade", modLabel: expect.any(String), description: "Öhlins rear shock", cost: 400, date: today, mileage: 15000 });

    const byLabel: any = await toolProposeLogEntry("owner@example.com", { category: "mod", description: "Tank pads", cost: 20, date: today, modCategory: "Tank pads / protectors" });
    expect(byLabel.modCategory).toBe("tank-pads");
  });

  it("fuzzy-matches a plain-language mod category by substring, case-insensitively", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", { category: "mod", description: "Phone mount", cost: 15, date: today, modCategory: "PHONE mount" });
    expect(result.modCategory).toBe("phone-mount");
  });

  it("falls back to 'other-accessory' for a mod category with no match, rather than blocking the draft, e.g. a wax or detailing product", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", { category: "mod", description: "Szuwax detailing spray", cost: 12, date: today, modCategory: "szuwax" });
    expect(result.modCategory).toBe("other-accessory");
  });

  it("falls back to 'other-accessory' when modCategory is missing entirely", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", { category: "mod", description: "Mystery part", cost: 12, date: today });
    expect(result.modCategory).toBe("other-accessory");
  });

  it("drafts a fuel entry with litres, cost, and the account's current mileage - no description needed", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", { category: "fuel", cost: 15, date: today, litres: 10 });
    expect(result).toEqual({ category: "fuel", litres: 10, cost: 15, date: today, mileage: 15000, filledToFull: false });
  });

  it("only marks a fuel entry filledToFull when explicitly told true", async () => {
    const result: any = await toolProposeLogEntry("owner@example.com", { category: "fuel", cost: 15, date: today, litres: 10, filledToFull: true });
    expect(result.filledToFull).toBe(true);
  });

  it("rejects a missing, non-numeric, or non-positive litres for a fuel entry", async () => {
    expect((await toolProposeLogEntry("owner@example.com", { category: "fuel", cost: 15, date: today }) as any).error).toMatch(/litres/i);
    expect((await toolProposeLogEntry("owner@example.com", { category: "fuel", cost: 15, date: today, litres: 0 }) as any).error).toMatch(/litres/i);
    expect((await toolProposeLogEntry("owner@example.com", { category: "fuel", cost: 15, date: today, litres: -3 }) as any).error).toMatch(/litres/i);
  });

  // Labour is the one category available on both vehicle kinds - see
  // the top-of-file comment in assistantTools.ts for why.
  describe("labour (bike-active)", () => {
    it("drafts a labour entry, resolving an exact category key or label, tagged vehicleKind: 'bike'", async () => {
      const byKey: any = await toolProposeLogEntry("owner@example.com", {
        category: "labour", description: "Front brake bleed", cost: 45, date: today, labourCategory: "brake-bleeding",
      });
      expect(byKey).toEqual({
        category: "labour", labourCategory: "brake-bleeding", labourLabel: expect.any(String),
        description: "Front brake bleed", cost: 45, date: today, mileage: 15000, vehicleKind: "bike",
      });
    });

    it("fuzzy-matches a plain-language labour category by substring, case-insensitively", async () => {
      const result: any = await toolProposeLogEntry("owner@example.com", { category: "labour", description: "Bleeding the brakes", cost: 45, date: today, labourCategory: "BRAKE bleeding" });
      expect(result.labourCategory).toBe("brake-bleeding");
    });

    it("falls back to 'other' for a labour category with no match, rather than blocking the draft", async () => {
      const result: any = await toolProposeLogEntry("owner@example.com", { category: "labour", description: "Something unusual", cost: 45, date: today, labourCategory: "not-a-real-labour-job" });
      expect(result.labourCategory).toBe("other");
    });

    it("falls back to 'other' when labourCategory is missing entirely", async () => {
      const result: any = await toolProposeLogEntry("owner@example.com", { category: "labour", description: "Workshop time", cost: 45, date: today });
      expect(result.labourCategory).toBe("other");
    });

    it("still requires a description and a valid cost for labour, same as every other bike category", async () => {
      expect((await toolProposeLogEntry("owner@example.com", { category: "labour", cost: 45, date: today }) as any).error).toMatch(/description/i);
      expect((await toolProposeLogEntry("owner@example.com", { category: "labour", description: "Workshop time", cost: 0, date: today }) as any).error).toMatch(/cost/i);
    });
  });

  describe("labour (car-active)", () => {
    it("drafts a labour entry against the car's own catalog and mileage, tagged vehicleKind: 'car'", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      const result: any = await toolProposeLogEntry("owner@example.com", {
        category: "labour", description: "EV battery health check", cost: 60, date: today, labourCategory: "hv-battery-health-check",
      });
      expect(result).toEqual({
        category: "labour", labourCategory: "hv-battery-health-check", labourLabel: expect.any(String),
        description: "EV battery health check", cost: 60, date: today, mileage: 20000, vehicleKind: "car",
      });
    });

    it("falls back to 'other' for an unmatched car labour category", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      const result: any = await toolProposeLogEntry("owner@example.com", { category: "labour", description: "Something unusual", cost: 60, date: today, labourCategory: "not-a-real-car-labour-job" });
      expect(result.labourCategory).toBe("other");
    });

    it("still requires a description and a valid, non-future date for car labour", async () => {
      mocks.resolveActiveVehicle.mockResolvedValue(carActive());
      expect((await toolProposeLogEntry("owner@example.com", { category: "labour", cost: 60, date: today }) as any).error).toMatch(/description/i);
      const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      expect((await toolProposeLogEntry("owner@example.com", { category: "labour", description: "Workshop time", cost: 60, date: tomorrow }) as any).error).toMatch(/future/);
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
      const result: any = await toolProposeLogEntry("owner@example.com", {
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
      const result: any = await toolProposeLogEntry("owner@example.com", {
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
      const result: any = await toolProposeLogEntry("owner@example.com", {
        category: "service", description: "Oil change", cost: 40, date: "2010-01-01",
      });
      expect(result.mileage).toBe(8000); // bike.startingMileage - a provisional anchor, not a fabricated guess
      expect(result.mileageNote).toMatch(/before this bike was added/);
    });
  });
});
