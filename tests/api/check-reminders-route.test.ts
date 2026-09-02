import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAllReminders: vi.fn(),
  markReminderNotified: vi.fn(),
  getBike: vi.fn(),
  sendReminderEmail: vi.fn(),
  upsert: vi.fn(),
}));

// computeReminderStatus/reminderDetailLabel are the route's own pure
// orchestration logic (re-exported from reminderStatus.ts, which has zero
// Cosmos dependency) - kept real via importActual so overdue-detection
// behaves exactly as in production; only the Cosmos-backed reminder
// functions are replaced.
vi.mock("@/lib/tracker/reminder", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tracker/reminder")>("@/lib/tracker/reminder");
  return {
    ...actual,
    getAllReminders: mocks.getAllReminders,
    markReminderNotified: mocks.markReminderNotified,
  };
});
vi.mock("@/lib/tracker/bike", () => ({ getBike: mocks.getBike }));
vi.mock("@/lib/resend", () => ({ sendReminderEmail: mocks.sendReminderEmail }));
vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({ items: { upsert: mocks.upsert } }),
}));

import { POST } from "@/app/api/cron/check-reminders/route";

function request(headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/cron/check-reminders", { method: "POST", headers });
}

function overdueDateReminder(overrides: Record<string, unknown> = {}) {
  const past = new Date(Date.now() - 10 * 86_400_000).toISOString();
  return {
    id: "r1", pk: "rider@example.com", type: "reminder", name: "Insurance renewal",
    intervalType: "date", exactDate: past, date: "2024-01-01", createdAt: "2024-01-01T00:00:00.000Z",
    notifiedAt: null,
    ...overrides,
  };
}

function futureDateReminder(overrides: Record<string, unknown> = {}) {
  const future = new Date(Date.now() + 60 * 86_400_000).toISOString();
  return {
    id: "r2", pk: "rider@example.com", type: "reminder", name: "MOT",
    intervalType: "date", exactDate: future, date: "2024-01-01", createdAt: "2024-01-01T00:00:00.000Z",
    notifiedAt: null,
    ...overrides,
  };
}

describe("POST /api/cron/check-reminders", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    process.env.CRON_SECRET = "top-secret";
    mocks.getAllReminders.mockResolvedValue([]);
    mocks.markReminderNotified.mockResolvedValue(undefined);
    mocks.sendReminderEmail.mockResolvedValue(undefined);
    mocks.upsert.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it("rejects a request with no authorization header", async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.getAllReminders).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong secret", async () => {
    const response = await POST(request({ authorization: "Bearer wrong" }));
    expect(response.status).toBe(401);
  });

  it("rejects every request when CRON_SECRET isn't configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(401);
  });

  it("no-ops cleanly when there are no reminders at all", async () => {
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, checked: 0, sent: 0 });
    expect(mocks.sendReminderEmail).not.toHaveBeenCalled();
  });

  it("skips a reminder that's already been notified about", async () => {
    mocks.getAllReminders.mockResolvedValue([overdueDateReminder({ notifiedAt: "2025-01-01T00:00:00.000Z" })]);
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();
    expect(body).toEqual({ ok: true, checked: 1, sent: 0 });
    expect(mocks.sendReminderEmail).not.toHaveBeenCalled();
  });

  it("skips a mileage reminder defensively when it has no bikeId (pre-migration data)", async () => {
    mocks.getAllReminders.mockResolvedValue([
      { id: "r3", pk: "rider@example.com", intervalType: "mileage", intervalValue: 500, baseMileage: 0, notifiedAt: null, date: "2024-01-01" },
    ]);
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();
    expect(body).toEqual({ ok: true, checked: 1, sent: 0 });
    expect(mocks.getBike).not.toHaveBeenCalled();
  });

  it("skips a mileage reminder whose bike no longer exists", async () => {
    mocks.getAllReminders.mockResolvedValue([
      { id: "r4", pk: "rider@example.com", bikeId: "bike-1", intervalType: "mileage", intervalValue: 500, baseMileage: 0, notifiedAt: null, date: "2024-01-01" },
    ]);
    mocks.getBike.mockResolvedValue(null);
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();
    expect(body.sent).toBe(0);
    expect(mocks.sendReminderEmail).not.toHaveBeenCalled();
  });

  it("does not email for a reminder that isn't overdue yet", async () => {
    mocks.getAllReminders.mockResolvedValue([futureDateReminder()]);
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();
    expect(body).toEqual({ ok: true, checked: 1, sent: 0 });
    expect(mocks.sendReminderEmail).not.toHaveBeenCalled();
  });

  it("emails and marks notified for an overdue reminder, then persists a cronStatus summary", async () => {
    mocks.getAllReminders.mockResolvedValue([overdueDateReminder()]);
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, checked: 1, sent: 1 });
    expect(mocks.sendReminderEmail).toHaveBeenCalledWith(
      "rider@example.com", "Insurance renewal", expect.stringContaining("due")
    );
    expect(mocks.markReminderNotified).toHaveBeenCalledWith("rider@example.com", "r1");
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      id: "cronStatus::reminders", pk: "system", type: "cronStatus", checked: 1, sent: 1,
    }));
  });

  it("isolates a single failed send and still checks/sends every other reminder in the run", async () => {
    mocks.getAllReminders.mockResolvedValue([
      overdueDateReminder({ id: "r1", pk: "first@example.com" }),
      overdueDateReminder({ id: "r5", pk: "second@example.com", name: "Tax renewal" }),
    ]);
    mocks.sendReminderEmail.mockImplementation(async (email: string) => {
      if (email === "first@example.com") throw new Error("Resend API down");
    });

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true, checked: 2, sent: 1, failed: 1 });
    // the second reminder was still reached and sent despite the first failing.
    expect(mocks.sendReminderEmail).toHaveBeenCalledWith("second@example.com", "Tax renewal", expect.anything());
    expect(mocks.markReminderNotified).toHaveBeenCalledWith("second@example.com", "r5");
    // left un-notified so tomorrow's run retries it.
    expect(mocks.markReminderNotified).not.toHaveBeenCalledWith("first@example.com", "r1");
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      id: "cronStatus::reminders", checked: 2, sent: 1, failed: 1,
    }));
  });

  // Idempotency: a scheduler retry, a duplicate trigger, or an admin
  // re-running this via RunCronButton must never re-notify someone who
  // was already emailed. This isn't asserting anything the route
  // computes specially for a "second run" - it's proving the ordinary
  // `if (reminder.notifiedAt) continue` skip, combined with
  // markReminderNotified genuinely persisting, is enough on its own: a
  // stateful fake (not a fresh mock per call) is what makes the second
  // POST actually see the first POST's write, the same way two real
  // invocations against real Cosmos would.
  it("running the cron twice in a row only ever sends the same overdue reminder's email once", async () => {
    const reminder = overdueDateReminder() as Omit<ReturnType<typeof overdueDateReminder>, "notifiedAt"> & { notifiedAt: string | null };
    mocks.getAllReminders.mockImplementation(async () => [reminder]);
    mocks.markReminderNotified.mockImplementation(async (_email: string, id: string) => {
      if (id === reminder.id) reminder.notifiedAt = new Date().toISOString();
    });

    const first = await POST(request({ authorization: "Bearer top-secret" }));
    expect(await first.json()).toEqual({ ok: true, checked: 1, sent: 1 });

    const second = await POST(request({ authorization: "Bearer top-secret" }));
    expect(await second.json()).toEqual({ ok: true, checked: 1, sent: 0 });

    expect(mocks.sendReminderEmail).toHaveBeenCalledTimes(1);
  });
});
