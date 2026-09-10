import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  createCar: vi.fn(),
  getPrimaryCar: vi.fn(),
  getCarsForUser: vi.fn(),
  getBikesForUser: vi.fn(),
  isPro: vi.fn(),
  updateCarMileage: vi.fn(),
  updateCarRegion: vi.fn(),
  updateCarBudget: vi.fn(),
  updateCarUnits: vi.fn(),
  updateCarCurrency: vi.fn(),
  updateCarChartType: vi.fn(),
  updateCarDvlaData: vi.fn(),
  updateCarIncludeInsuranceInReport: vi.fn(),
  updateCarIncludeFinanceInReport: vi.fn(),
  isCarReadOnly: vi.fn(),
  fetchDvlaDataFromVdg: vi.fn(),
  fetchVehicleTaxDetailsFromVdg: vi.fn(),
  syncCarSornReminder: vi.fn(),
  logVedCarBillIfNeeded: vi.fn(),
  logImpersonationActivityForCurrentRequest: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/admin/impersonation", () => ({
  logImpersonationActivityForCurrentRequest: mocks.logImpersonationActivityForCurrentRequest,
}));
vi.mock("@/lib/tracker/car", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tracker/car")>("@/lib/tracker/car");
  return {
    createCar: mocks.createCar,
    getPrimaryCar: mocks.getPrimaryCar,
    getCarsForUser: mocks.getCarsForUser,
    countActiveCars: actual.countActiveCars,
    updateCarMileage: mocks.updateCarMileage,
    updateCarRegion: mocks.updateCarRegion,
    updateCarBudget: mocks.updateCarBudget,
    updateCarUnits: mocks.updateCarUnits,
    updateCarCurrency: mocks.updateCarCurrency,
    updateCarChartType: mocks.updateCarChartType,
    updateCarDvlaData: mocks.updateCarDvlaData,
    updateCarIncludeInsuranceInReport: mocks.updateCarIncludeInsuranceInReport,
    updateCarIncludeFinanceInReport: mocks.updateCarIncludeFinanceInReport,
    isCarReadOnly: mocks.isCarReadOnly,
    CAR_READ_ONLY_MESSAGE: "This car has been transferred and is now read-only.",
  };
});
vi.mock("@/lib/tracker/bike", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tracker/bike")>("@/lib/tracker/bike");
  return { getBikesForUser: mocks.getBikesForUser, countActiveBikes: actual.countActiveBikes };
});
vi.mock("@/lib/subscriptions", () => ({ isPro: mocks.isPro }));
vi.mock("@/lib/tracker/dvlaDataFetch", () => ({ fetchDvlaDataFromVdg: mocks.fetchDvlaDataFromVdg }));
vi.mock("@/lib/tracker/vehicleTaxFetch", () => ({ fetchVehicleTaxDetailsFromVdg: mocks.fetchVehicleTaxDetailsFromVdg }));
vi.mock("@/lib/tracker/carReminder", () => ({ syncCarSornReminder: mocks.syncCarSornReminder }));
vi.mock("@/lib/tracker/carBill", () => ({ logVedCarBillIfNeeded: mocks.logVedCarBillIfNeeded }));
// Unlike bike/route.ts, there's no bike-class-style classification here to
// leave real - car creation doesn't derive anything pure from the payload
// the way getBikeClassForCC does, so there's nothing unmocked to exercise.

import { POST, PATCH } from "@/app/api/cars/car/route";

function request(method: "POST" | "PATCH", body: string): NextRequest {
  return new NextRequest("http://localhost/api/cars/car", {
    method,
    headers: { "content-type": "application/json" },
    body,
  });
}

const validCreatePayload = {
  make: "Toyota",
  model: "Corolla",
  fuelType: "petrol",
  engineLitres: 1.8,
  year: 2019,
  registration: "ab12 cde",
  currentMileage: 1000,
  nickname: "The Runabout",
  region: "uk",
};

describe("POST /api/cars/car", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.createCar.mockResolvedValue({ id: "car-1", originalRegistration: "AB12CDE" });
    mocks.fetchDvlaDataFromVdg.mockResolvedValue(null);
    mocks.fetchVehicleTaxDetailsFromVdg.mockResolvedValue(null);
    mocks.syncCarSornReminder.mockResolvedValue(undefined);
    mocks.logVedCarBillIfNeeded.mockResolvedValue(false);
    process.env.VDG_API_KEY = "test-key";
    // Combined cap pre-check defaults: an account with nothing else
    // tracked and no Pro subscription never trips the new guard, so
    // every existing test below (written before that guard existed)
    // keeps exercising createCar unchanged.
    mocks.isPro.mockResolvedValue(false);
    mocks.getCarsForUser.mockResolvedValue([]);
    mocks.getBikesForUser.mockResolvedValue([]);
  });

  it("rejects unauthenticated requests before reading the body", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request("POST", "not-json"));
    expect(response.status).toBe(401);
    expect(mocks.createCar).not.toHaveBeenCalled();
  });

  // The combined bike+car cap - checked BEFORE createCar is ever called
  // (createCar itself has no cap logic of its own, unlike createBike).
  it("blocks a free account at the combined bike+car cap before ever calling createCar", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getBikesForUser.mockResolvedValue([{ id: "bike-1", transferredTo: undefined }]);
    mocks.getCarsForUser.mockResolvedValue([{ id: "car-1", transferredTo: undefined }]);

    const response = await POST(request("POST", JSON.stringify(validCreatePayload)));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Free accounts can track up to 1 vehicle total (bikes and cars combined). Upgrade to add more.",
      reason: "limit_reached",
    });
    expect(mocks.createCar).not.toHaveBeenCalled();
  });

  it("allows a Pro account past the combined cap", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isPro.mockResolvedValue(true);
    mocks.getBikesForUser.mockResolvedValue([{ id: "bike-1", transferredTo: undefined }]);
    mocks.getCarsForUser.mockResolvedValue([{ id: "car-1", transferredTo: undefined }]);

    const response = await POST(request("POST", JSON.stringify(validCreatePayload)));

    expect(response.status).toBe(200);
    expect(mocks.createCar).toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request("POST", "not-json"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request body." });
  });

  it("rejects a payload missing required fields", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request("POST", JSON.stringify({ make: "Toyota" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please fill in all required fields." });
    expect(mocks.createCar).not.toHaveBeenCalled();
  });

  // Car-specific validation branch: engine size only makes sense for
  // something with an engine, so it's required for every fuel type
  // except electric (engineCC has no such exemption on the bike route).
  it("requires engine size for a non-electric fuel type", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request("POST", JSON.stringify({ ...validCreatePayload, engineLitres: undefined })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Engine size is required for this fuel type." });
    expect(mocks.createCar).not.toHaveBeenCalled();
  });

  it("allows a missing engine size when fuelType is electric", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request("POST", JSON.stringify({
      ...validCreatePayload, fuelType: "electric", engineLitres: undefined,
    })));
    expect(response.status).toBe(200);
  });

  it("requires a production year unless it's a custom build or an electric car", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request("POST", JSON.stringify({ ...validCreatePayload, year: undefined })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Production year is required for this fuel type, unless this is a custom build.",
    });
  });

  it("allows a missing year when isCustomBuild is true", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(
      request("POST", JSON.stringify({ ...validCreatePayload, year: undefined, isCustomBuild: true }))
    );
    expect(response.status).toBe(200);
  });

  // Car-only exemption, on top of the custom-build one the bike route
  // already has: an electric car's production year is skippable too,
  // even when isCustomBuild is never set.
  it("allows a missing year when fuelType is electric, even without isCustomBuild", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request("POST", JSON.stringify({
      ...validCreatePayload, fuelType: "electric", engineLitres: undefined, year: undefined,
    })));
    expect(response.status).toBe(200);
  });

  it("rejects an empty or whitespace-only registration", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request("POST", JSON.stringify({ ...validCreatePayload, registration: "   " })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Registration number is required." });
  });

  it("trims and uppercases the registration before creating the car", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await POST(request("POST", JSON.stringify({ ...validCreatePayload, registration: "  ab12 cde  " })));
    expect(mocks.createCar).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({ registration: "AB12 CDE" }));
  });

  // Explicit guarantee from the source: a custom build's year is never
  // passed through even if the client supplied one.
  it("drops the year field for a custom build even if one is supplied", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await POST(request("POST", JSON.stringify({ ...validCreatePayload, isCustomBuild: true, year: 2019 })));
    expect(mocks.createCar).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({ year: undefined, isCustomBuild: true }));
  });

  // Same guarantee, car-only: an electric car's engineLitres is never
  // passed through either, even if the client supplied one.
  it("drops the engineLitres field for an electric car even if one is supplied", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await POST(request("POST", JSON.stringify({ ...validCreatePayload, fuelType: "electric", engineLitres: 1.8 })));
    expect(mocks.createCar).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({ fuelType: "electric", engineLitres: undefined }));
  });

  it("passes batteryKwh straight through to createCar when provided", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await POST(request("POST", JSON.stringify({ ...validCreatePayload, fuelType: "phev", batteryKwh: 10.5 })));
    expect(mocks.createCar).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({ batteryKwh: 10.5 }));
  });

  // Unlike createBike, createCar always resolves straight to a CarDoc -
  // there's no free-tier cap here, so no {ok:false, limit, reason} shape
  // to unwrap and no 403-on-cap branch exists in this route at all. This
  // is simply the plain success path, which is the only path that exists.
  it("creates the car and returns it when the DVLA lookup finds nothing", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetchDvlaDataFromVdg.mockResolvedValue(null);

    const response = await POST(request("POST", JSON.stringify(validCreatePayload)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ car: { id: "car-1", originalRegistration: "AB12CDE" } });
    expect(mocks.updateCarDvlaData).not.toHaveBeenCalled();
    expect(mocks.logImpersonationActivityForCurrentRequest).toHaveBeenCalledWith("car", "car-1", "create");
  });

  it("attaches DVLA data to the created car when the lookup succeeds", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const dvlaData = { fetchedAt: "2025-01-01T00:00:00.000Z", keeperChangeList: [], plateChangeList: [], v5cIssueDates: [] };
    mocks.fetchDvlaDataFromVdg.mockResolvedValue(dvlaData);

    const response = await POST(request("POST", JSON.stringify(validCreatePayload)));

    expect(response.status).toBe(200);
    expect(mocks.updateCarDvlaData).toHaveBeenCalledWith("owner@example.com", "car-1", dvlaData);
    const body = await response.json();
    expect(body.car.dvlaData).toEqual(dvlaData);
  });

  // Explicit non-blocking guarantee stated in the source comment: a
  // failed DVLA lookup must never fail car creation itself.
  it("still returns the created car when the DVLA lookup throws", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetchDvlaDataFromVdg.mockRejectedValue(new Error("DVLA API unavailable"));

    const response = await POST(request("POST", JSON.stringify(validCreatePayload)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ car: { id: "car-1", originalRegistration: "AB12CDE" } });
  });

  it("checks tax/SORN status and syncs the reminder using the newly created car's registration", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetchVehicleTaxDetailsFromVdg.mockResolvedValue({ taxStatus: "SORN" });

    await POST(request("POST", JSON.stringify(validCreatePayload)));

    expect(mocks.fetchVehicleTaxDetailsFromVdg).toHaveBeenCalledWith("AB12CDE", "test-key");
    expect(mocks.syncCarSornReminder).toHaveBeenCalledWith("owner@example.com", "car-1", "SORN");
  });

  // See carBill.ts's logVedCarBillIfNeeded - a confirmed-taxed vehicle
  // also gets its current VED period logged as a real expense at
  // creation time.
  it("logs the current VED period as a bill using the tax check's result", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const taxDetails = { taxStatus: "Taxed", taxDueDate: "2027-06-01" };
    mocks.fetchVehicleTaxDetailsFromVdg.mockResolvedValue(taxDetails);

    await POST(request("POST", JSON.stringify(validCreatePayload)));

    expect(mocks.logVedCarBillIfNeeded).toHaveBeenCalledWith("owner@example.com", "car-1", taxDetails);
  });

  it("skips the tax/SORN check entirely when VDG_API_KEY isn't configured", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    delete process.env.VDG_API_KEY;

    const response = await POST(request("POST", JSON.stringify(validCreatePayload)));

    expect(response.status).toBe(200);
    expect(mocks.fetchVehicleTaxDetailsFromVdg).not.toHaveBeenCalled();
    expect(mocks.syncCarSornReminder).not.toHaveBeenCalled();
    expect(mocks.logVedCarBillIfNeeded).not.toHaveBeenCalled();
  });

  it("still returns the created car when the tax/SORN check throws", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetchVehicleTaxDetailsFromVdg.mockRejectedValue(new Error("VDG unavailable"));

    const response = await POST(request("POST", JSON.stringify(validCreatePayload)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ car: { id: "car-1", originalRegistration: "AB12CDE" } });
  });
});

describe("PATCH /api/cars/car", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getPrimaryCar.mockResolvedValue({ id: "car-1" });
    mocks.isCarReadOnly.mockReturnValue(false);
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
    expect(mocks.getPrimaryCar).not.toHaveBeenCalled();
  });

  it("returns 404 when the account has no car yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryCar.mockResolvedValue(null);
    const response = await PATCH(request("PATCH", JSON.stringify({ currentMileage: 2000 })));
    expect(response.status).toBe(404);
  });

  it("blocks writes to a transferred (read-only) car before any update call", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isCarReadOnly.mockReturnValue(true);
    const response = await PATCH(request("PATCH", JSON.stringify({ currentMileage: 2000 })));
    expect(response.status).toBe(403);
    expect(mocks.updateCarMileage).not.toHaveBeenCalled();
  });

  it("rejects a negative mileage", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request("PATCH", JSON.stringify({ currentMileage: -5 })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Enter a valid mileage." });
    expect(mocks.updateCarMileage).not.toHaveBeenCalled();
  });

  it("rejects a zero or negative annual budget", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request("PATCH", JSON.stringify({ annualBudget: 0 })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Enter a valid budget amount." });
  });

  it("updates the mileage", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateCarMileage.mockResolvedValue({ id: "car-1", currentMileage: 2000 });
    const response = await PATCH(request("PATCH", JSON.stringify({ currentMileage: 2000 })));
    expect(response.status).toBe(200);
    expect(mocks.updateCarMileage).toHaveBeenCalledWith("owner@example.com", "car-1", 2000);
  });

  it("updates the region", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateCarRegion.mockResolvedValue({ id: "car-1", region: "eu" });
    const response = await PATCH(request("PATCH", JSON.stringify({ region: "eu" })));
    expect(response.status).toBe(200);
    expect(mocks.updateCarRegion).toHaveBeenCalledWith("owner@example.com", "car-1", "eu");
  });

  it("updates the annual budget", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateCarBudget.mockResolvedValue({ id: "car-1", annualBudget: 800 });
    const response = await PATCH(request("PATCH", JSON.stringify({ annualBudget: 800 })));
    expect(response.status).toBe(200);
    expect(mocks.updateCarBudget).toHaveBeenCalledWith("owner@example.com", "car-1", 800);
    expect(mocks.logImpersonationActivityForCurrentRequest).toHaveBeenCalledWith("car", "car-1", "update");
  });

  // CarDoc carries no fuelEconomyUnit (see car.ts's own ADR comment) -
  // updateCarUnits only ever takes a distanceUnit, unlike updateBikeUnits
  // which also threads a second, fuel-economy-unit argument.
  it("updates the distance unit", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateCarUnits.mockResolvedValue({ id: "car-1", distanceUnit: "km" });
    const response = await PATCH(request("PATCH", JSON.stringify({ distanceUnit: "km" })));
    expect(response.status).toBe(200);
    expect(mocks.updateCarUnits).toHaveBeenCalledWith("owner@example.com", "car-1", "km", undefined);
  });

  it("updates the fuel economy unit", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateCarUnits.mockResolvedValue({ id: "car-1", fuelEconomyUnit: "l100km" });
    const response = await PATCH(request("PATCH", JSON.stringify({ fuelEconomyUnit: "l100km" })));
    expect(response.status).toBe(200);
    expect(mocks.updateCarUnits).toHaveBeenCalledWith("owner@example.com", "car-1", undefined, "l100km");
  });

  it("updates the currency", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateCarCurrency.mockResolvedValue({ id: "car-1", currency: "eur" });
    const response = await PATCH(request("PATCH", JSON.stringify({ currency: "eur" })));
    expect(response.status).toBe(200);
    expect(mocks.updateCarCurrency).toHaveBeenCalledWith("owner@example.com", "car-1", "eur");
  });

  it("updates a chart's type only when both chartId and kind are supplied", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateCarChartType.mockResolvedValue({ id: "car-1", chartTypes: { spend: "bar" } });
    const response = await PATCH(request("PATCH", JSON.stringify({ chartType: { chartId: "spend", kind: "bar" } })));
    expect(response.status).toBe(200);
    expect(mocks.updateCarChartType).toHaveBeenCalledWith("owner@example.com", "car-1", "spend", "bar");
  });

  it("updates includeInsuranceInReport", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateCarIncludeInsuranceInReport.mockResolvedValue({ id: "car-1", includeInsuranceInReport: true });
    const response = await PATCH(request("PATCH", JSON.stringify({ includeInsuranceInReport: true })));
    expect(response.status).toBe(200);
    expect(mocks.updateCarIncludeInsuranceInReport).toHaveBeenCalledWith("owner@example.com", "car-1", true);
  });

  it("updates includeFinanceInReport", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateCarIncludeFinanceInReport.mockResolvedValue({ id: "car-1", includeFinanceInReport: false });
    const response = await PATCH(request("PATCH", JSON.stringify({ includeFinanceInReport: false })));
    expect(response.status).toBe(200);
    expect(mocks.updateCarIncludeFinanceInReport).toHaveBeenCalledWith("owner@example.com", "car-1", false);
  });

  // Real, slightly surprising behaviour worth pinning as-is, same as the
  // bike route: the "nothing to update" guard only checks truthiness of
  // the whole chartType object, not that both chartId and kind are
  // present. A chartType missing kind is truthy, so it passes that guard,
  // then falls through every update branch untouched (car stays null) and
  // lands on the generic "No car found" 404 rather than a 400 explaining
  // the real problem.
  it("falls through to a 404 (not a 400) for an incomplete chartType missing kind", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request("PATCH", JSON.stringify({ chartType: { chartId: "spend" } })));
    expect(response.status).toBe(404);
    expect(mocks.updateCarChartType).not.toHaveBeenCalled();
  });

  // The route runs each provided field's update sequentially (not
  // else-if), reassigning `car` each time - so with multiple fields the
  // response reflects whichever update ran last.
  it("runs every provided field's update, with the response reflecting the last one executed", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateCarMileage.mockResolvedValue({ id: "car-1", currentMileage: 3000 });
    mocks.updateCarCurrency.mockResolvedValue({ id: "car-1", currency: "usd" });

    const response = await PATCH(request("PATCH", JSON.stringify({ currentMileage: 3000, currency: "usd" })));

    expect(response.status).toBe(200);
    expect(mocks.updateCarMileage).toHaveBeenCalled();
    expect(mocks.updateCarCurrency).toHaveBeenCalled();
    // currency's update runs after mileage's in source order, so its
    // result is what the response actually carries.
    await expect(response.json()).resolves.toEqual({ car: { id: "car-1", currency: "usd" } });
  });

  it("returns 404 if the update itself can't find the car (e.g. deleted mid-request)", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateCarMileage.mockResolvedValue(null);
    const response = await PATCH(request("PATCH", JSON.stringify({ currentMileage: 3000 })));
    expect(response.status).toBe(404);
  });
});
