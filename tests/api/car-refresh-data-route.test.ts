// Place at: tests/api/car-refresh-data-route.test.ts
// Car equivalent of bike-refresh-data-route.test.ts - same coverage,
// against CarDoc and the car-specific import/reminder modules.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCarById: vi.fn(),
  getCurrentRegistration: vi.fn(),
  updateCarDvlaData: vi.fn(),
  isCarReadOnly: vi.fn(),
  canRefreshCarData: vi.fn(),
  nextCarDataRefreshAt: vi.fn(),
  updateCarLastRefreshedAt: vi.fn(),
  fetchDvlaDataFromVdg: vi.fn(),
  importMotHistoryForCar: vi.fn(),
  fetchVehicleTaxDetailsFromVdg: vi.fn(),
  syncCarSornReminder: vi.fn(),
  logVedCarBillIfNeeded: vi.fn(),
  logImpersonationActivityForCurrentRequest: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/admin/impersonation", () => ({
  logImpersonationActivityForCurrentRequest: mocks.logImpersonationActivityForCurrentRequest,
}));
vi.mock("@/lib/tracker/car", () => ({
  getCarById: mocks.getCarById,
  getCurrentRegistration: mocks.getCurrentRegistration,
  updateCarDvlaData: mocks.updateCarDvlaData,
  isCarReadOnly: mocks.isCarReadOnly,
  canRefreshCarData: mocks.canRefreshCarData,
  nextCarDataRefreshAt: mocks.nextCarDataRefreshAt,
  updateCarLastRefreshedAt: mocks.updateCarLastRefreshedAt,
  CAR_READ_ONLY_MESSAGE: "This car has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/dvlaDataFetch", () => ({ fetchDvlaDataFromVdg: mocks.fetchDvlaDataFromVdg }));
vi.mock("@/lib/tracker/carMotHistoryImport", () => ({ importMotHistoryForCar: mocks.importMotHistoryForCar }));
vi.mock("@/lib/tracker/vehicleTaxFetch", () => ({ fetchVehicleTaxDetailsFromVdg: mocks.fetchVehicleTaxDetailsFromVdg }));
vi.mock("@/lib/tracker/carReminder", () => ({ syncCarSornReminder: mocks.syncCarSornReminder }));
vi.mock("@/lib/tracker/carBill", () => ({ logVedCarBillIfNeeded: mocks.logVedCarBillIfNeeded }));

import { POST } from "@/app/api/cars/car/refresh-data/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/cars/car/refresh-data", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const car = { id: "car-1", originalRegistration: "AB12 CDE" };

describe("POST /api/cars/car/refresh-data", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getCarById.mockResolvedValue(car);
    mocks.isCarReadOnly.mockReturnValue(false);
    mocks.canRefreshCarData.mockReturnValue(true);
    mocks.nextCarDataRefreshAt.mockReturnValue(null);
    mocks.updateCarLastRefreshedAt.mockResolvedValue(car);
    mocks.getCurrentRegistration.mockReturnValue("AB12 CDE");
    mocks.fetchDvlaDataFromVdg.mockResolvedValue(null);
    mocks.importMotHistoryForCar.mockResolvedValue({ createdCount: 0, skippedCount: 0, skipped: [], motDueDate: null, reminderSet: false });
    mocks.fetchVehicleTaxDetailsFromVdg.mockResolvedValue(null);
    mocks.syncCarSornReminder.mockResolvedValue(undefined);
    mocks.logVedCarBillIfNeeded.mockResolvedValue(false);
    process.env.VDG_API_KEY = "test-key";
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request("{}"));
    expect(response.status).toBe(401);
    expect(mocks.getCarById).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request("not-json"));
    expect(response.status).toBe(400);
  });

  it("requires a carId", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({})));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "carId is required." });
  });

  it("returns 404 when the car isn't found for this account", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getCarById.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify({ carId: "car-1" })));
    expect(response.status).toBe(404);
  });

  it("blocks refreshing a transferred (read-only) car", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isCarReadOnly.mockReturnValue(true);
    const response = await POST(request(JSON.stringify({ carId: "car-1" })));
    expect(response.status).toBe(403);
    expect(mocks.fetchDvlaDataFromVdg).not.toHaveBeenCalled();
  });

  it("blocks refreshing again within the 5-day cooldown", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.canRefreshCarData.mockReturnValue(false);
    mocks.nextCarDataRefreshAt.mockReturnValue("2027-06-05T00:00:00.000Z");
    const response = await POST(request(JSON.stringify({ carId: "car-1" })));
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "Vehicle data was refreshed recently.",
      nextAvailableAt: "2027-06-05T00:00:00.000Z",
    });
    expect(mocks.fetchDvlaDataFromVdg).not.toHaveBeenCalled();
  });

  it("stamps lastRefreshedAt after a successful refresh", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await POST(request(JSON.stringify({ carId: "car-1" })));
    expect(mocks.updateCarLastRefreshedAt).toHaveBeenCalledWith("owner@example.com", "car-1");
  });

  it("refuses a car with no registration on record", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getCurrentRegistration.mockReturnValue(undefined);
    const response = await POST(request(JSON.stringify({ carId: "car-1" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "This car has no registration on record, so it can't be looked up.",
    });
  });

  it("reports dvlaRefreshed true and saves the data when the DVLA lookup succeeds", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const dvlaData = { fetchedAt: "2025-01-01T00:00:00.000Z", keeperChangeList: [], plateChangeList: [], v5cIssueDates: [] };
    mocks.fetchDvlaDataFromVdg.mockResolvedValue(dvlaData);

    const response = await POST(request(JSON.stringify({ carId: "car-1" })));

    expect(response.status).toBe(200);
    expect(mocks.updateCarDvlaData).toHaveBeenCalledWith("owner@example.com", "car-1", dvlaData);
    await expect(response.json()).resolves.toMatchObject({ ok: true, dvlaRefreshed: true });
    expect(mocks.logImpersonationActivityForCurrentRequest).toHaveBeenCalledWith("car", "car-1", "update");
  });

  it("reports dvlaRefreshed false without saving anything when the lookup finds nothing", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetchDvlaDataFromVdg.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify({ carId: "car-1" })));
    expect(mocks.updateCarDvlaData).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ dvlaRefreshed: false });
    expect(mocks.logImpersonationActivityForCurrentRequest).not.toHaveBeenCalled();
  });

  it("still returns 200 and still attempts the MOT import when the DVLA refresh throws", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetchDvlaDataFromVdg.mockRejectedValue(new Error("DVLA API unavailable"));

    const response = await POST(request(JSON.stringify({ carId: "car-1" })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, dvlaRefreshed: false });
    expect(mocks.importMotHistoryForCar).toHaveBeenCalledWith("owner@example.com", car, "AB12 CDE");
  });

  it("reports the created/skipped counts from a successful MOT import", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.importMotHistoryForCar.mockResolvedValue({
      createdCount: 3,
      skippedCount: 1,
      skipped: [{ date: "2024-01-01", reason: "Already logged." }],
      motDueDate: "2026-01-01",
      reminderSet: true,
    });

    const response = await POST(request(JSON.stringify({ carId: "car-1" })));

    await expect(response.json()).resolves.toMatchObject({ motCreated: 3, motSkipped: 1 });
    expect(mocks.logImpersonationActivityForCurrentRequest).toHaveBeenCalledWith("car", "car-1", "update");
  });

  it("leaves motCreated/motSkipped at 0 when the MOT import itself reports an error result", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.importMotHistoryForCar.mockResolvedValue({ error: "No MOT history found.", status: 404 });

    const response = await POST(request(JSON.stringify({ carId: "car-1" })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, motCreated: 0, motSkipped: 0 });
  });

  it("still returns 200 with motCreated/motSkipped at 0 when the MOT import throws", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.importMotHistoryForCar.mockRejectedValue(new Error("MOT API unavailable"));

    const response = await POST(request(JSON.stringify({ carId: "car-1" })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, motCreated: 0, motSkipped: 0 });
  });

  it("reports sorned true and syncs the reminder when the vehicle comes back SORN'd", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetchVehicleTaxDetailsFromVdg.mockResolvedValue({ taxStatus: "SORN" });

    const response = await POST(request(JSON.stringify({ carId: "car-1" })));

    expect(mocks.fetchVehicleTaxDetailsFromVdg).toHaveBeenCalledWith("AB12 CDE", "test-key");
    expect(mocks.syncCarSornReminder).toHaveBeenCalledWith("owner@example.com", "car-1", "SORN", null);
    await expect(response.json()).resolves.toMatchObject({ sorned: true, taxStatus: "SORN" });
  });

  it("reports sorned false and still syncs the reminder (to clear one if it exists) when the vehicle is taxed", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetchVehicleTaxDetailsFromVdg.mockResolvedValue({ taxStatus: "Taxed", taxDueDate: "2027-06-01" });

    const response = await POST(request(JSON.stringify({ carId: "car-1" })));

    expect(mocks.syncCarSornReminder).toHaveBeenCalledWith("owner@example.com", "car-1", "Taxed", "2027-06-01");
    await expect(response.json()).resolves.toMatchObject({ sorned: false, taxStatus: "Taxed", taxDueDate: "2027-06-01" });
  });

  it("returns taxStatus/taxDueDate as null when the tax check didn't run or found nothing", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetchVehicleTaxDetailsFromVdg.mockResolvedValue(null);

    const response = await POST(request(JSON.stringify({ carId: "car-1" })));

    await expect(response.json()).resolves.toMatchObject({ sorned: false, taxStatus: null, taxDueDate: null });
  });

  it("skips the tax/SORN check entirely when VDG_API_KEY isn't configured", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    delete process.env.VDG_API_KEY;

    const response = await POST(request(JSON.stringify({ carId: "car-1" })));

    expect(mocks.fetchVehicleTaxDetailsFromVdg).not.toHaveBeenCalled();
    expect(mocks.syncCarSornReminder).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ sorned: false });
  });

  it("still returns 200 with sorned false when the tax/SORN check throws", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetchVehicleTaxDetailsFromVdg.mockRejectedValue(new Error("VDG unavailable"));

    const response = await POST(request(JSON.stringify({ carId: "car-1" })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, sorned: false });
  });

  // Auto-logging the current VED period as an expense - see carBill.ts's
  // logVedCarBillIfNeeded, called right after the SORN reminder sync.
  it("reports taxBillLogged true and logs the impersonation activity when a new road-tax bill is logged", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const taxDetails = { taxStatus: "Taxed", taxDueDate: "2027-06-01" };
    mocks.fetchVehicleTaxDetailsFromVdg.mockResolvedValue(taxDetails);
    mocks.logVedCarBillIfNeeded.mockResolvedValue(true);

    const response = await POST(request(JSON.stringify({ carId: "car-1" })));

    expect(mocks.logVedCarBillIfNeeded).toHaveBeenCalledWith("owner@example.com", "car-1", taxDetails);
    await expect(response.json()).resolves.toMatchObject({ taxBillLogged: true });
    expect(mocks.logImpersonationActivityForCurrentRequest).toHaveBeenCalledWith("car", "car-1", "update");
  });

  it("reports taxBillLogged false when the bill for this period already exists", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetchVehicleTaxDetailsFromVdg.mockResolvedValue({ taxStatus: "Taxed", taxDueDate: "2027-06-01" });
    mocks.logVedCarBillIfNeeded.mockResolvedValue(false);

    const response = await POST(request(JSON.stringify({ carId: "car-1" })));

    await expect(response.json()).resolves.toMatchObject({ taxBillLogged: false });
  });
});
