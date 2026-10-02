import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { parseReminderEdit } from "@/lib/tracker/reminderEdit";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryBike: vi.fn(),
  isBikeReadOnly: vi.fn(),
  updateReminder: vi.fn(),
  deleteReminder: vi.fn(),
  getReminderById: vi.fn(),
  logImpersonationActivityForCurrentRequest: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({
  getPrimaryBike: mocks.getPrimaryBike,
  isBikeReadOnly: mocks.isBikeReadOnly,
  BIKE_READ_ONLY_MESSAGE: "This bike has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/reminder", () => ({
  updateReminder: mocks.updateReminder,
  deleteReminder: mocks.deleteReminder,
  getReminderById: mocks.getReminderById,
}));
vi.mock("@/lib/admin/impersonation", () => ({
  logImpersonationActivityForCurrentRequest: mocks.logImpersonationActivityForCurrentRequest,
}));

import { PUT } from "@/app/api/tracker/reminders/[id]/route";

const ownId = "owner@example.com::reminder::abc123";
const params = (id = ownId) => ({ params: Promise.resolve({ id: encodeURIComponent(id) }) });
function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/tracker/reminders/x", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("parseReminderEdit", () => {
  it("takes a name and a miles, months or date schedule", () => {
    expect(parseReminderEdit({ name: " Chain ", intervalType: "mileage", intervalValue: 500 })).toEqual({ ok: true, edit: { name: "Chain", intervalType: "mileage", intervalValue: 500 } });
    expect(parseReminderEdit({ name: "Insurance", intervalType: "months", intervalValue: "12" })).toEqual({ ok: true, edit: { name: "Insurance", intervalType: "months", intervalValue: 12 } });
    expect(parseReminderEdit({ name: "MOT", intervalType: "date", exactDate: "2027-03-01" })).toEqual({ ok: true, edit: { name: "MOT", intervalType: "date", exactDate: "2027-03-01" } });
  });

  it("refuses a missing name, a bad schedule or a system-only type", () => {
    expect(parseReminderEdit({ intervalType: "months", intervalValue: 12 }).ok).toBe(false);
    expect(parseReminderEdit({ name: "x", intervalType: "months", intervalValue: 0 }).ok).toBe(false);
    expect(parseReminderEdit({ name: "x", intervalType: "months", intervalValue: 1.5 }).ok).toBe(false);
    expect(parseReminderEdit({ name: "x", intervalType: "date", exactDate: "soon" }).ok).toBe(false);
    expect(parseReminderEdit({ name: "x", intervalType: "permanent" }).ok).toBe(false);
  });
});

describe("PUT /api/tracker/reminders/[id] (edit)", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1", currentMileage: 8000 });
    mocks.isBikeReadOnly.mockReturnValue(false);
    mocks.getReminderById.mockResolvedValue({ id: ownId, intervalType: "months", baseMileage: 7000 });
    mocks.updateReminder.mockResolvedValue({ id: ownId });
  });

  it("needs a signed-in owner of this reminder", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await PUT(request({}), params())).status).toBe(401);
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    expect((await PUT(request({ name: "x", intervalType: "months", intervalValue: 6 }), params("someone@example.com::reminder::z"))).status).toBe(404);
    expect(mocks.updateReminder).not.toHaveBeenCalled();
  });

  it("updates the name and schedule, keeping what was last done", async () => {
    const response = await PUT(request({ name: "Chain clean", intervalType: "mileage", intervalValue: 600 }), params());
    expect(response.status).toBe(200);
    expect(mocks.updateReminder).toHaveBeenCalledWith("owner@example.com", ownId, {
      name: "Chain clean",
      intervalType: "mileage",
      intervalValue: 600,
      exactDate: undefined,
      baseMileage: 7000,
    });
  });

  it("switches to an exact date", async () => {
    await PUT(request({ name: "MOT", intervalType: "date", exactDate: "2027-03-01" }), params());
    expect(mocks.updateReminder.mock.calls[0][2]).toMatchObject({ intervalType: "date", exactDate: "2027-03-01", intervalValue: undefined });
  });

  it("refuses bad input, a transferred bike and an automatic reminder", async () => {
    expect((await PUT(request({ name: "", intervalType: "months", intervalValue: 6 }), params())).status).toBe(400);
    mocks.isBikeReadOnly.mockReturnValue(true);
    expect((await PUT(request({ name: "x", intervalType: "months", intervalValue: 6 }), params())).status).toBe(403);
    mocks.isBikeReadOnly.mockReturnValue(false);
    mocks.getReminderById.mockResolvedValue({ id: ownId, intervalType: "permanent" });
    expect((await PUT(request({ name: "x", intervalType: "months", intervalValue: 6 }), params())).status).toBe(403);
    expect(mocks.updateReminder).not.toHaveBeenCalled();
  });
});
