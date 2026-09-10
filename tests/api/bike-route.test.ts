import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  createBike: vi.fn(),
  getPrimaryBike: vi.fn(),
  getBikesForUser: vi.fn(),
  getCarsForUser: vi.fn(),
  isPro: vi.fn(),
  updateBikeMileage: vi.fn(),
  updateBikeRegion: vi.fn(),
  updateBikeBudget: vi.fn(),
  updateBikeUnits: vi.fn(),
  updateBikeCurrency: vi.fn(),
  updateBikeIncludeInsuranceInReport: vi.fn(),
  updateBikeIncludeFinanceInReport: vi.fn(),
  updateBikeChartType: vi.fn(),
  updateBikeDvlaData: vi.fn(),
  isBikeReadOnly: vi.fn(),
  fetchDvlaDataFromVdg: vi.fn(),
  fetchVehicleTaxDetailsFromVdg: vi.fn(),
  syncSornReminder: vi.fn(),
  logImpersonationActivityForCurrentRequest: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/admin/impersonation", () => ({
  logImpersonationActivityForCurrentRequest: mocks.logImpersonationActivityForCurrentRequest,
}));
vi.mock("@/lib/tracker/bike", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tracker/bike")>("@/lib/tracker/bike");
  return {
    createBike: mocks.createBike,
    getPrimaryBike: mocks.getPrimaryBike,
    getBikesForUser: mocks.getBikesForUser,
    countActiveBikes: actual.countActiveBikes,
    updateBikeMileage: mocks.updateBikeMileage,
    updateBikeRegion: mocks.updateBikeRegion,
    updateBikeBudget: mocks.updateBikeBudget,
    updateBikeUnits: mocks.updateBikeUnits,
    updateBikeCurrency: mocks.updateBikeCurrency,
    updateBikeIncludeInsuranceInReport: mocks.updateBikeIncludeInsuranceInReport,
    updateBikeIncludeFinanceInReport: mocks.updateBikeIncludeFinanceInReport,
    updateBikeChartType: mocks.updateBikeChartType,
    updateBikeDvlaData: mocks.updateBikeDvlaData,
    isBikeReadOnly: mocks.isBikeReadOnly,
    BIKE_READ_ONLY_MESSAGE: "This bike has been transferred and is now read-only.",
  };
});
vi.mock("@/lib/tracker/car", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tracker/car")>("@/lib/tracker/car");
  return { getCarsForUser: mocks.getCarsForUser, countActiveCars: actual.countActiveCars };
});
vi.mock("@/lib/subscriptions", () => ({ isPro: mocks.isPro }));
vi.mock("@/lib/tracker/dvlaDataFetch", () => ({ fetchDvlaDataFromVdg: mocks.fetchDvlaDataFromVdg }));
vi.mock("@/lib/tracker/vehicleTaxFetch", () => ({ fetchVehicleTaxDetailsFromVdg: mocks.fetchVehicleTaxDetailsFromVdg }));
vi.mock("@/lib/tracker/reminder", () => ({ syncSornReminder: mocks.syncSornReminder }));
// getBikeClassForCC (from @/lib/motorcycleModels) is deliberately NOT mocked -
// it's a pure threshold function, so the tests exercise the real logic
// rather than a stand-in for it.

import { POST, PATCH } from "@/app/api/tracker/bike/route";

function request(method: "POST" | "PATCH", body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/bike", {
    method,
    headers: { "content-type": "application/json" },
    body,
  });
}

const validCreatePayload = {
  make: "Honda",
  model: "CB500F",
  engineCC: 471,
  year: 2019,
  registration: "ab12 cde",
  currentMileage: 1000,
  nickname: "The Beast",
  region: "uk",
};

describe("POST /api/tracker/bike", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.createBike.mockResolvedValue({ ok: true, bike: { id: "bike-1", originalRegistration: "AB12CDE" } });
    mocks.fetchDvlaDataFromVdg.mockResolvedValue(null);
    mocks.fetchVehicleTaxDetailsFromVdg.mockResolvedValue(null);
    mocks.syncSornReminder.mockResolvedValue(undefined);
    process.env.VDG_API_KEY = "test-key";
    // Combined cap pre-check defaults: an account with nothing else
    // tracked and no Pro subscription never trips the new outer guard,
    // so every existing test below (written before that guard existed)
    // keeps exercising createBike's own mocked behaviour unchanged.
    mocks.isPro.mockResolvedValue(false);
    mocks.getBikesForUser.mockResolvedValue([]);
    mocks.getCarsForUser.mockResolvedValue([]);
  });

  it("rejects unauthenticated requests before reading the body", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request("POST", "not-json"));
    expect(response.status).toBe(401);
    expect(mocks.createBike).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request("POST", "not-json"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request body." });
  });

  it("rejects a payload missing required fields", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request("POST", JSON.stringify({ make: "Honda" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please fill in all required fields." });
    expect(mocks.createBike).not.toHaveBeenCalled();
  });

  it("requires a production year unless it's a custom build", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request("POST", JSON.stringify({ ...validCreatePayload, year: undefined })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Production year is required, unless this is a custom build.",
    });
  });

  it("allows a missing year when isCustomBuild is true", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(
      request("POST", JSON.stringify({ ...validCreatePayload, year: undefined, isCustomBuild: true }))
    );
    expect(response.status).toBe(200);
  });

  it("rejects an empty or whitespace-only registration", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request("POST", JSON.stringify({ ...validCreatePayload, registration: "   " })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Registration number is required." });
  });

  // Thresholds mirrored from getBikeClassForCC's own source comment:
  // small up to 400cc, medium 401-750cc, large 751cc+. Real function,
  // not mocked - this pins the route actually wires it up correctly.
  it.each([
    [125, "small"],
    [400, "small"],
    [471, "medium"],
    [750, "medium"],
    [1000, "large"],
  ])("classifies a %icc bike as %s", async (engineCC, expectedClass) => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await POST(request("POST", JSON.stringify({ ...validCreatePayload, engineCC })));
    expect(mocks.createBike).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({ bikeClass: expectedClass }));
  });

  it("trims and uppercases the registration before creating the bike", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await POST(request("POST", JSON.stringify({ ...validCreatePayload, registration: "  ab12 cde  " })));
    expect(mocks.createBike).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({ registration: "AB12 CDE" }));
  });

  // Explicit guarantee from the source: a custom build's year is never
  // passed through even if the client supplied one.
  it("drops the year field for a custom build even if one is supplied", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await POST(request("POST", JSON.stringify({ ...validCreatePayload, isCustomBuild: true, year: 2019 })));
    expect(mocks.createBike).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({ year: undefined, isCustomBuild: true }));
  });

  it("responds 403 with the account's limit when the free-tier cap is reached", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.createBike.mockResolvedValue({ ok: false, reason: "limit_reached", limit: 1 });

    const response = await POST(request("POST", JSON.stringify(validCreatePayload)));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Free accounts can track up to 1 bike. Upgrade to add more.",
      reason: "limit_reached",
    });
  });

  // The combined cap - checked BEFORE createBike is ever called, so a
  // free account that already owns a car (even with zero bikes of its
  // own) can't add a bike either, even though createBike's own
  // (bike-only) count would allow it.
  it("blocks a free account at the combined bike+car cap before ever calling createBike", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getBikesForUser.mockResolvedValue([]);
    mocks.getCarsForUser.mockResolvedValue([{ id: "car-1", transferredTo: undefined }]);

    const response = await POST(request("POST", JSON.stringify(validCreatePayload)));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Free accounts can track up to 1 vehicle total (bikes and cars combined). Upgrade to add more.",
      reason: "limit_reached",
    });
    expect(mocks.createBike).not.toHaveBeenCalled();
  });

  it("allows a Pro account past the combined cap", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isPro.mockResolvedValue(true);
    mocks.getBikesForUser.mockResolvedValue([{ id: "bike-1", transferredTo: undefined }]);
    mocks.getCarsForUser.mockResolvedValue([{ id: "car-1", transferredTo: undefined }]);

    const response = await POST(request("POST", JSON.stringify(validCreatePayload)));

    expect(response.status).toBe(200);
    expect(mocks.createBike).toHaveBeenCalled();
  });

  it("creates the bike and returns it when the DVLA lookup finds nothing", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetchDvlaDataFromVdg.mockResolvedValue(null);

    const response = await POST(request("POST", JSON.stringify(validCreatePayload)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ bike: { id: "bike-1", originalRegistration: "AB12CDE" } });
    expect(mocks.updateBikeDvlaData).not.toHaveBeenCalled();
    expect(mocks.logImpersonationActivityForCurrentRequest).toHaveBeenCalledWith("bike", "bike-1", "create");
  });

  it("attaches DVLA data to the created bike when the lookup succeeds", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const dvlaData = { fetchedAt: "2025-01-01T00:00:00.000Z", keeperChangeList: [], plateChangeList: [], v5cIssueDates: [] };
    mocks.fetchDvlaDataFromVdg.mockResolvedValue(dvlaData);

    const response = await POST(request("POST", JSON.stringify(validCreatePayload)));

    expect(response.status).toBe(200);
    expect(mocks.updateBikeDvlaData).toHaveBeenCalledWith("owner@example.com", "bike-1", dvlaData);
    const body = await response.json();
    expect(body.bike.dvlaData).toEqual(dvlaData);
  });

  // Explicit non-blocking guarantee stated in the source comment: a
  // failed DVLA lookup must never fail bike creation itself.
  it("still returns the created bike when the DVLA lookup throws", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetchDvlaDataFromVdg.mockRejectedValue(new Error("DVLA API unavailable"));

    const response = await POST(request("POST", JSON.stringify(validCreatePayload)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ bike: { id: "bike-1", originalRegistration: "AB12CDE" } });
  });

  // Tax/SORN check - runs alongside the DVLA fetch, at creation time, so
  // a SORN'd bike gets its permanent reminder immediately rather than
  // only being discovered on the first "Refresh vehicle data" click.
  it("checks tax/SORN status and syncs the reminder using the newly created bike's registration", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetchVehicleTaxDetailsFromVdg.mockResolvedValue({ taxStatus: "SORN" });

    await POST(request("POST", JSON.stringify(validCreatePayload)));

    expect(mocks.fetchVehicleTaxDetailsFromVdg).toHaveBeenCalledWith("AB12CDE", "test-key");
    expect(mocks.syncSornReminder).toHaveBeenCalledWith("owner@example.com", "bike-1", "SORN");
  });

  it("skips the tax/SORN check entirely when VDG_API_KEY isn't configured", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    delete process.env.VDG_API_KEY;

    const response = await POST(request("POST", JSON.stringify(validCreatePayload)));

    expect(response.status).toBe(200);
    expect(mocks.fetchVehicleTaxDetailsFromVdg).not.toHaveBeenCalled();
    expect(mocks.syncSornReminder).not.toHaveBeenCalled();
  });

  // Same non-blocking guarantee as the DVLA fetch above, in its own
  // try/catch - a tax-check failure must never fail bike creation.
  it("still returns the created bike when the tax/SORN check throws", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetchVehicleTaxDetailsFromVdg.mockRejectedValue(new Error("VDG unavailable"));

    const response = await POST(request("POST", JSON.stringify(validCreatePayload)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ bike: { id: "bike-1", originalRegistration: "AB12CDE" } });
  });
});

describe("PATCH /api/tracker/bike", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1" });
    mocks.isBikeReadOnly.mockReturnValue(false);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await PATCH(request("PATCH", "{}"));
    expect(response.status).toBe(401);
  });

  it("rejects malformed JSON", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request("PATCH", "not-json"));
    expect(response.status).toBe(400);
  });

  it("rejects an empty patch with nothing to update", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request("PATCH", JSON.stringify({})));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Nothing to update." });
    expect(mocks.getPrimaryBike).not.toHaveBeenCalled();
  });

  it("returns 404 when the account has no bike yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryBike.mockResolvedValue(null);
    const response = await PATCH(request("PATCH", JSON.stringify({ currentMileage: 2000 })));
    expect(response.status).toBe(404);
  });

  it("blocks writes to a transferred (read-only) bike before any update call", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);
    const response = await PATCH(request("PATCH", JSON.stringify({ currentMileage: 2000 })));
    expect(response.status).toBe(403);
    expect(mocks.updateBikeMileage).not.toHaveBeenCalled();
  });

  it("rejects a negative mileage", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request("PATCH", JSON.stringify({ currentMileage: -5 })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Enter a valid mileage." });
    expect(mocks.updateBikeMileage).not.toHaveBeenCalled();
  });

  it("rejects a zero or negative annual budget", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request("PATCH", JSON.stringify({ annualBudget: 0 })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Enter a valid budget amount." });
  });

  it("updates the mileage", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateBikeMileage.mockResolvedValue({ id: "bike-1", currentMileage: 2000 });
    const response = await PATCH(request("PATCH", JSON.stringify({ currentMileage: 2000 })));
    expect(response.status).toBe(200);
    expect(mocks.updateBikeMileage).toHaveBeenCalledWith("owner@example.com", "bike-1", 2000);
    expect(mocks.logImpersonationActivityForCurrentRequest).toHaveBeenCalledWith("bike", "bike-1", "update");
  });

  it("updates the region", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateBikeRegion.mockResolvedValue({ id: "bike-1", region: "eu" });
    const response = await PATCH(request("PATCH", JSON.stringify({ region: "eu" })));
    expect(response.status).toBe(200);
    expect(mocks.updateBikeRegion).toHaveBeenCalledWith("owner@example.com", "bike-1", "eu");
  });

  it("updates the annual budget", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateBikeBudget.mockResolvedValue({ id: "bike-1", annualBudget: 800 });
    const response = await PATCH(request("PATCH", JSON.stringify({ annualBudget: 800 })));
    expect(response.status).toBe(200);
    expect(mocks.updateBikeBudget).toHaveBeenCalledWith("owner@example.com", "bike-1", 800);
    expect(mocks.logImpersonationActivityForCurrentRequest).toHaveBeenCalledWith("bike", "bike-1", "update");
  });

  it("updates units when either distanceUnit or fuelEconomyUnit is supplied", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateBikeUnits.mockResolvedValue({ id: "bike-1", distanceUnit: "km" });
    const response = await PATCH(request("PATCH", JSON.stringify({ distanceUnit: "km" })));
    expect(response.status).toBe(200);
    expect(mocks.updateBikeUnits).toHaveBeenCalledWith("owner@example.com", "bike-1", "km", undefined);
  });

  it("updates the currency", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateBikeCurrency.mockResolvedValue({ id: "bike-1", currency: "eur" });
    const response = await PATCH(request("PATCH", JSON.stringify({ currency: "eur" })));
    expect(response.status).toBe(200);
    expect(mocks.updateBikeCurrency).toHaveBeenCalledWith("owner@example.com", "bike-1", "eur");
  });

  it("updates includeInsuranceInReport when set to true", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateBikeIncludeInsuranceInReport.mockResolvedValue({ id: "bike-1", includeInsuranceInReport: true });
    const response = await PATCH(request("PATCH", JSON.stringify({ includeInsuranceInReport: true })));
    expect(response.status).toBe(200);
    expect(mocks.updateBikeIncludeInsuranceInReport).toHaveBeenCalledWith("owner@example.com", "bike-1", true);
  });

  // Explicitly setting it back to false must still count as "something
  // to update", not be treated the same as omitting the field entirely -
  // false is a real, meaningful value here, not an empty one.
  it("updates includeInsuranceInReport when explicitly set to false", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateBikeIncludeInsuranceInReport.mockResolvedValue({ id: "bike-1", includeInsuranceInReport: false });
    const response = await PATCH(request("PATCH", JSON.stringify({ includeInsuranceInReport: false })));
    expect(response.status).toBe(200);
    expect(mocks.updateBikeIncludeInsuranceInReport).toHaveBeenCalledWith("owner@example.com", "bike-1", false);
  });

  it("updates includeFinanceInReport independently of includeInsuranceInReport", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateBikeIncludeFinanceInReport.mockResolvedValue({ id: "bike-1", includeFinanceInReport: true });
    const response = await PATCH(request("PATCH", JSON.stringify({ includeFinanceInReport: true })));
    expect(response.status).toBe(200);
    expect(mocks.updateBikeIncludeFinanceInReport).toHaveBeenCalledWith("owner@example.com", "bike-1", true);
    expect(mocks.updateBikeIncludeInsuranceInReport).not.toHaveBeenCalled();
  });

  it("updates a chart's type only when both chartId and kind are supplied", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateBikeChartType.mockResolvedValue({ id: "bike-1", chartTypes: { spend: "bar" } });
    const response = await PATCH(request("PATCH", JSON.stringify({ chartType: { chartId: "spend", kind: "bar" } })));
    expect(response.status).toBe(200);
    expect(mocks.updateBikeChartType).toHaveBeenCalledWith("owner@example.com", "bike-1", "spend", "bar");
  });

  // Real, slightly surprising behaviour worth pinning as-is: the "nothing
  // to update" guard only checks truthiness of the whole chartType object,
  // not that both chartId and kind are present. A chartType missing kind
  // is truthy, so it passes that guard, then falls through every update
  // branch untouched (bike stays null) and lands on the generic
  // "No bike found" 404 rather than a 400 explaining the real problem.
  it("falls through to a 404 (not a 400) for an incomplete chartType missing kind", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request("PATCH", JSON.stringify({ chartType: { chartId: "spend" } })));
    expect(response.status).toBe(404);
    expect(mocks.updateBikeChartType).not.toHaveBeenCalled();
  });

  // The route runs each provided field's update sequentially (not
  // else-if), reassigning `bike` each time - so with multiple fields the
  // response reflects whichever update ran last. Pinning that real,
  // slightly surprising behaviour as it stands today, not changing it.
  it("runs every provided field's update, with the response reflecting the last one executed", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateBikeMileage.mockResolvedValue({ id: "bike-1", currentMileage: 3000 });
    mocks.updateBikeCurrency.mockResolvedValue({ id: "bike-1", currency: "usd" });

    const response = await PATCH(request("PATCH", JSON.stringify({ currentMileage: 3000, currency: "usd" })));

    expect(response.status).toBe(200);
    expect(mocks.updateBikeMileage).toHaveBeenCalled();
    expect(mocks.updateBikeCurrency).toHaveBeenCalled();
    // currency's update runs after mileage's in source order, so its
    // result is what the response actually carries.
    await expect(response.json()).resolves.toEqual({ bike: { id: "bike-1", currency: "usd" } });
  });

  it("returns 404 if the update itself can't find the bike (e.g. deleted mid-request)", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateBikeMileage.mockResolvedValue(null);
    const response = await PATCH(request("PATCH", JSON.stringify({ currentMileage: 3000 })));
    expect(response.status).toBe(404);
  });
});