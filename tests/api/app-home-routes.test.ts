import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getGarage: vi.fn(),
  getHomeData: vi.fn(),
  getLogbook: vi.fn(),
  getMileageEstimate: vi.fn(),
  getReminderList: vi.fn(),
  getEntryDetail: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/app/homeData", () => ({
  getGarage: mocks.getGarage,
  getHomeData: mocks.getHomeData,
  getLogbook: mocks.getLogbook,
  getMileageEstimate: mocks.getMileageEstimate,
  getReminderList: mocks.getReminderList,
  getEntryDetail: mocks.getEntryDetail,
  ENTRY_CATEGORIES: ["fuel", "service", "mods", "bills", "labour", "fines", "tolls"],
}));

import { GET as getGarageRoute } from "@/app/api/app/garage/route";
import { GET as getHomeRoute } from "@/app/api/app/home/route";
import { GET as getLogbookRoute } from "@/app/api/app/logbook/route";
import { GET as getEstimateRoute } from "@/app/api/app/mileage-estimate/route";
import { GET as getRemindersRoute } from "@/app/api/app/reminders/route";
import { GET as getEntryRoute } from "@/app/api/app/entry/route";

function homeReq(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/app/home${query}`);
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
});

describe("GET /api/app/garage", () => {
  it("refuses anyone not signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await getGarageRoute();
    expect(res.status).toBe(401);
    expect(mocks.getGarage).not.toHaveBeenCalled();
  });

  it("returns the signed-in account's own garage, never cached", async () => {
    mocks.getGarage.mockResolvedValue({ vehicles: [], defaultVehicle: null });
    const res = await getGarageRoute();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getGarage).toHaveBeenCalledWith("rider@example.com");
  });
});

describe("GET /api/app/home", () => {
  it("refuses anyone not signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await getHomeRoute(homeReq("?kind=bike&id=b1"))).status).toBe(401);
    expect(mocks.getHomeData).not.toHaveBeenCalled();
  });

  it("needs a valid kind and an id", async () => {
    expect((await getHomeRoute(homeReq("?kind=boat&id=b1"))).status).toBe(400);
    expect((await getHomeRoute(homeReq("?kind=bike"))).status).toBe(400);
    expect(mocks.getHomeData).not.toHaveBeenCalled();
  });

  it("looks the vehicle up in the signed-in account only", async () => {
    mocks.getHomeData.mockResolvedValue({ ok: true });
    const res = await getHomeRoute(homeReq("?kind=car&id=c1"));
    expect(res.status).toBe(200);
    expect(mocks.getHomeData).toHaveBeenCalledWith("rider@example.com", "car", "c1");
  });

  it("answers 404 for a vehicle not on this account", async () => {
    mocks.getHomeData.mockResolvedValue(null);
    expect((await getHomeRoute(homeReq("?kind=bike&id=not-mine"))).status).toBe(404);
  });
});

describe("GET /api/app/logbook", () => {
  const logbookReq = (query: string) => new NextRequest(`http://localhost/api/app/logbook${query}`);

  it("refuses anyone not signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await getLogbookRoute(logbookReq("?kind=bike&id=b1"))).status).toBe(401);
    expect(mocks.getLogbook).not.toHaveBeenCalled();
  });

  it("needs a valid kind and an id", async () => {
    expect((await getLogbookRoute(logbookReq("?kind=van&id=b1"))).status).toBe(400);
    expect((await getLogbookRoute(logbookReq("?id=b1"))).status).toBe(400);
  });

  it("looks the vehicle up in the signed-in account only, and 404s otherwise", async () => {
    mocks.getLogbook.mockResolvedValue({ entries: [] });
    const res = await getLogbookRoute(logbookReq("?kind=bike&id=b1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getLogbook).toHaveBeenCalledWith("rider@example.com", "bike", "b1");

    mocks.getLogbook.mockResolvedValue(null);
    expect((await getLogbookRoute(logbookReq("?kind=bike&id=not-mine"))).status).toBe(404);
  });
});

describe("GET /api/app/mileage-estimate", () => {
  const estimateReq = (query: string) => new NextRequest(`http://localhost/api/app/mileage-estimate${query}`);

  it("refuses anyone not signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await getEstimateRoute(estimateReq("?kind=bike&id=b1&date=2026-09-01"))).status).toBe(401);
    expect(mocks.getMileageEstimate).not.toHaveBeenCalled();
  });

  it("needs kind, id and a YYYY-MM-DD date", async () => {
    expect((await getEstimateRoute(estimateReq("?kind=bike&id=b1"))).status).toBe(400);
    expect((await getEstimateRoute(estimateReq("?kind=bike&id=b1&date=1/9/2026"))).status).toBe(400);
    expect((await getEstimateRoute(estimateReq("?kind=boat&id=b1&date=2026-09-01"))).status).toBe(400);
    expect(mocks.getMileageEstimate).not.toHaveBeenCalled();
  });

  it("estimates for the signed-in account's vehicle, and 404s otherwise", async () => {
    mocks.getMileageEstimate.mockResolvedValue({ mileageDisplay: 35100, note: "x" });
    const res = await getEstimateRoute(estimateReq("?kind=car&id=c1&date=2026-09-01"));
    expect(res.status).toBe(200);
    expect(mocks.getMileageEstimate).toHaveBeenCalledWith("rider@example.com", "car", "c1", "2026-09-01");

    mocks.getMileageEstimate.mockResolvedValue(null);
    expect((await getEstimateRoute(estimateReq("?kind=car&id=nope&date=2026-09-01"))).status).toBe(404);
  });
});

describe("GET /api/app/reminders", () => {
  const remindersReq = (query: string) => new NextRequest(`http://localhost/api/app/reminders${query}`);

  it("refuses anyone not signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await getRemindersRoute(remindersReq("?kind=bike&id=b1"))).status).toBe(401);
    expect(mocks.getReminderList).not.toHaveBeenCalled();
  });

  it("needs a valid kind and an id", async () => {
    expect((await getRemindersRoute(remindersReq("?kind=van&id=b1"))).status).toBe(400);
    expect((await getRemindersRoute(remindersReq("?kind=bike"))).status).toBe(400);
  });

  it("lists the signed-in account's own reminders, and 404s otherwise", async () => {
    mocks.getReminderList.mockResolvedValue({ reminders: [] });
    const res = await getRemindersRoute(remindersReq("?kind=car&id=c1"));
    expect(res.status).toBe(200);
    expect(mocks.getReminderList).toHaveBeenCalledWith("rider@example.com", "car", "c1");

    mocks.getReminderList.mockResolvedValue(null);
    expect((await getRemindersRoute(remindersReq("?kind=car&id=nope"))).status).toBe(404);
  });
});

describe("GET /api/app/entry", () => {
  const entryReq = (query: string) => new NextRequest(`http://localhost/api/app/entry${query}`);
  const full = "?kind=bike&id=b1&category=fuel&entryId=rider%40example.com%3A%3Afuel%3A%3A1";

  it("refuses anyone not signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await getEntryRoute(entryReq(full))).status).toBe(401);
    expect(mocks.getEntryDetail).not.toHaveBeenCalled();
  });

  it("needs a valid kind, a vehicle id, a known category and an entry id", async () => {
    expect((await getEntryRoute(entryReq("?kind=boat&id=b1&category=fuel&entryId=e1"))).status).toBe(400);
    expect((await getEntryRoute(entryReq("?kind=bike&category=fuel&entryId=e1"))).status).toBe(400);
    expect((await getEntryRoute(entryReq("?kind=bike&id=b1&category=vault&entryId=e1"))).status).toBe(400);
    expect((await getEntryRoute(entryReq("?kind=bike&id=b1&category=fuel"))).status).toBe(400);
    expect(mocks.getEntryDetail).not.toHaveBeenCalled();
  });

  it("answers 404 for an entry that isn't this account's", async () => {
    mocks.getEntryDetail.mockResolvedValue(null);
    expect((await getEntryRoute(entryReq(full))).status).toBe(404);
  });

  it("returns the signed-in account's own entry, never cached", async () => {
    mocks.getEntryDetail.mockResolvedValue({ vehicle: {}, entry: { id: "e1" } });
    const res = await getEntryRoute(entryReq(full));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getEntryDetail).toHaveBeenCalledWith("rider@example.com", "bike", "b1", "fuel", "rider@example.com::fuel::1");
  });
});
