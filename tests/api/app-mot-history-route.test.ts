// The app's MOT history route: own vehicles only, the 24-hour cache before
// any paid lookup, and the demo account never looked up for real.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getBike: vi.fn(),
  getCarById: vi.fn(),
  cachedMotLookup: vi.fn(),
  freshMotLookup: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({ getBike: mocks.getBike, getCurrentRegistration: (b: { registration?: string }) => b.registration }));
vi.mock("@/lib/tracker/car", () => ({ getCarById: mocks.getCarById, getCurrentRegistration: (c: { registration?: string }) => c.registration }));
vi.mock("@/lib/mot/motCheckLookup", () => ({ cachedMotLookup: mocks.cachedMotLookup, freshMotLookup: mocks.freshMotLookup }));

import { GET } from "@/app/api/app/mot-history/route";

const record = {
  registration: "AB12CDE", make: "FORD", model: "FOCUS", fuelType: "PETROL", colour: "BLUE", motDueDate: "2099-01-01",
  tests: [{ date: "2026-03-01T10:00:00", passed: true, mileage: 30000, expiryDate: "2027-03-01", defects: [] }],
  kind: null, source: "vdg",
};

function get(query: string) {
  return GET(new NextRequest(`https://roadverdict.co.uk/api/app/mot-history?${query}`));
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
});

describe("GET /api/app/mot-history", () => {
  it("needs a session, and a kind and id", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await get("kind=car&id=c1")).status).toBe(401);
    mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
    expect((await get("kind=boat&id=c1")).status).toBe(400);
  });

  it("only finds the account's own vehicle", async () => {
    mocks.getCarById.mockResolvedValue(null);
    expect((await get("kind=car&id=someone-elses")).status).toBe(404);
    expect(mocks.getCarById).toHaveBeenCalledWith("rider@example.com", "someone-elses");
  });

  it("uses the cache before paying for a lookup, and takes the kind from the owner", async () => {
    mocks.getCarById.mockResolvedValue({ registration: "ab12 cde" });
    mocks.cachedMotLookup.mockResolvedValue({ status: "found", record, cached: true });
    const body = await (await get("kind=car&id=c1")).json();
    expect(mocks.cachedMotLookup).toHaveBeenCalledWith("AB12CDE");
    expect(mocks.freshMotLookup).not.toHaveBeenCalled();
    expect(body.status).toBe("found");
    expect(body.view.registration).toBe("AB12CDE");
  });

  it("looks up fresh when there's nothing cached, and passes through not-found", async () => {
    mocks.getBike.mockResolvedValue({ registration: "AB12CDE" });
    mocks.cachedMotLookup.mockResolvedValue(null);
    mocks.freshMotLookup.mockResolvedValue({ status: "not_found" });
    expect(await (await get("kind=bike&id=b1")).json()).toEqual({ status: "not_found" });
  });

  it("says so when the vehicle has no registration", async () => {
    mocks.getBike.mockResolvedValue({ registration: undefined });
    expect(await (await get("kind=bike&id=b1")).json()).toEqual({ status: "no_registration" });
    expect(mocks.cachedMotLookup).not.toHaveBeenCalled();
  });

  it("never looks up the demo account's plates", async () => {
    mocks.getSession.mockResolvedValue({ email: "demo@roadverdict.co.uk" });
    mocks.getCarById.mockResolvedValue({ registration: "PA63 ERB" });
    const body = await (await get("kind=car&id=demo-car")).json();
    expect(body.status).toBe("found");
    expect(body.view.tests.length).toBeGreaterThan(0);
    expect(mocks.cachedMotLookup).not.toHaveBeenCalled();
    expect(mocks.freshMotLookup).not.toHaveBeenCalled();
  });
});
