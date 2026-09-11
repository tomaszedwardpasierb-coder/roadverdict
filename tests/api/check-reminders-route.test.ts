import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAllReminders: vi.fn(),
  markReminderNotified: vi.fn(),
  markReminderDueSoonBellNotified: vi.fn(),
  markReminderOverdueBellNotified: vi.fn(),
  getBike: vi.fn(),
  getAllCarReminders: vi.fn(),
  markCarReminderNotified: vi.fn(),
  markCarReminderDueSoonBellNotified: vi.fn(),
  markCarReminderOverdueBellNotified: vi.fn(),
  getCarById: vi.fn(),
  sendReminderEmail: vi.fn(),
  createReminderNotification: vi.fn(),
  upsert: vi.fn(),
  isPro: vi.fn(),
}));

// computeReminderStatus/reminderDetailLabel are the route's own pure
// orchestration logic (re-exported from reminderStatus.ts, which has zero
// Cosmos dependency) - kept real via importActual so overdue/due-soon
// detection behaves exactly as in production; only the Cosmos-backed
// reminder functions are replaced.
vi.mock("@/lib/tracker/reminder", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tracker/reminder")>("@/lib/tracker/reminder");
  return {
    ...actual,
    getAllReminders: mocks.getAllReminders,
    markReminderNotified: mocks.markReminderNotified,
    markReminderDueSoonBellNotified: mocks.markReminderDueSoonBellNotified,
    markReminderOverdueBellNotified: mocks.markReminderOverdueBellNotified,
  };
});
vi.mock("@/lib/tracker/bike", () => ({ getBike: mocks.getBike }));
// Same real-orchestration-logic reasoning as reminder.ts above, for the
// car equivalent (computeCarReminderStatus/carReminderDetailLabel are
// kept real, only the Cosmos-backed functions are replaced).
vi.mock("@/lib/tracker/carReminder", () => ({
  getAllCarReminders: mocks.getAllCarReminders,
  markCarReminderNotified: mocks.markCarReminderNotified,
  markCarReminderDueSoonBellNotified: mocks.markCarReminderDueSoonBellNotified,
  markCarReminderOverdueBellNotified: mocks.markCarReminderOverdueBellNotified,
}));
vi.mock("@/lib/tracker/car", () => ({ getCarById: mocks.getCarById }));
vi.mock("@/lib/resend", () => ({ sendReminderEmail: mocks.sendReminderEmail }));
vi.mock("@/lib/tracker/notification", () => ({ createReminderNotification: mocks.createReminderNotification }));
vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({ items: { upsert: mocks.upsert } }),
}));
vi.mock("@/lib/subscriptions", () => ({ isPro: mocks.isPro }));

import { POST } from "@/app/api/cron/check-reminders/route";

function request(headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/cron/check-reminders", { method: "POST", headers });
}

const bike = { id: "bike-1", make: "Honda", model: "CB500F", nickname: "", currentMileage: 5000 };
const car = { id: "car-1", make: "Ford", model: "Focus", nickname: "", currentMileage: 20000 };

function overdueDateReminder(overrides: Record<string, unknown> = {}) {
  const past = new Date(Date.now() - 10 * 86_400_000).toISOString();
  return {
    id: "r1", pk: "rider@example.com", type: "reminder", name: "Insurance renewal", bikeId: "bike-1",
    intervalType: "date", exactDate: past, date: "2024-01-01", createdAt: "2024-01-01T00:00:00.000Z",
    notifiedAt: null, dueSoonBellNotifiedAt: null, overdueBellNotifiedAt: null,
    ...overrides,
  };
}

function futureDateReminder(overrides: Record<string, unknown> = {}) {
  const future = new Date(Date.now() + 60 * 86_400_000).toISOString();
  return {
    id: "r2", pk: "rider@example.com", type: "reminder", name: "MOT", bikeId: "bike-1",
    intervalType: "date", exactDate: future, date: "2024-01-01", createdAt: "2024-01-01T00:00:00.000Z",
    notifiedAt: null, dueSoonBellNotifiedAt: null, overdueBellNotifiedAt: null,
    ...overrides,
  };
}

// Within the 14-day "due soon" window, but not yet overdue.
function dueSoonDateReminder(overrides: Record<string, unknown> = {}) {
  const soon = new Date(Date.now() + 5 * 86_400_000).toISOString();
  return {
    id: "r6", pk: "rider@example.com", type: "reminder", name: "MOT", bikeId: "bike-1",
    intervalType: "date", exactDate: soon, date: "2024-01-01", createdAt: "2024-01-01T00:00:00.000Z",
    notifiedAt: null, dueSoonBellNotifiedAt: null, overdueBellNotifiedAt: null,
    ...overrides,
  };
}

function overdueDateCarReminder(overrides: Record<string, unknown> = {}) {
  const past = new Date(Date.now() - 10 * 86_400_000).toISOString();
  return {
    id: "cr1", pk: "driver@example.com", type: "carReminder", name: "Insurance renewal", carId: "car-1",
    intervalType: "date", exactDate: past, date: "2024-01-01", createdAt: "2024-01-01T00:00:00.000Z",
    notifiedAt: null, dueSoonBellNotifiedAt: null, overdueBellNotifiedAt: null,
    ...overrides,
  };
}

function dueSoonDateCarReminder(overrides: Record<string, unknown> = {}) {
  const soon = new Date(Date.now() + 5 * 86_400_000).toISOString();
  return {
    id: "cr6", pk: "driver@example.com", type: "carReminder", name: "MOT", carId: "car-1",
    intervalType: "date", exactDate: soon, date: "2024-01-01", createdAt: "2024-01-01T00:00:00.000Z",
    notifiedAt: null, dueSoonBellNotifiedAt: null, overdueBellNotifiedAt: null,
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
    mocks.markReminderDueSoonBellNotified.mockResolvedValue(undefined);
    mocks.markReminderOverdueBellNotified.mockResolvedValue(undefined);
    mocks.getAllCarReminders.mockResolvedValue([]);
    mocks.markCarReminderNotified.mockResolvedValue(undefined);
    mocks.markCarReminderDueSoonBellNotified.mockResolvedValue(undefined);
    mocks.markCarReminderOverdueBellNotified.mockResolvedValue(undefined);
    mocks.sendReminderEmail.mockResolvedValue(undefined);
    mocks.createReminderNotification.mockResolvedValue(undefined);
    mocks.upsert.mockResolvedValue(undefined);
    mocks.getBike.mockResolvedValue(bike);
    mocks.getCarById.mockResolvedValue(car);
    // Default every account to Pro so the pre-existing send-path tests
    // below don't need to know about the Premium gate at all - only the
    // tests specifically about that gate override this.
    mocks.isPro.mockResolvedValue(true);
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
    await expect(response.json()).resolves.toEqual({ ok: true, checked: 0, sent: 0, notified: 0 });
    expect(mocks.sendReminderEmail).not.toHaveBeenCalled();
  });

  it("still checks an already-emailed reminder (for bell notifications), but never re-emails it", async () => {
    mocks.getAllReminders.mockResolvedValue([overdueDateReminder({ notifiedAt: "2025-01-01T00:00:00.000Z", overdueBellNotifiedAt: "2025-01-01T00:00:00.000Z" })]);
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();
    expect(body).toEqual({ ok: true, checked: 1, sent: 0, notified: 0 });
    expect(mocks.sendReminderEmail).not.toHaveBeenCalled();
    expect(mocks.createReminderNotification).not.toHaveBeenCalled();
  });

  it("skips a reminder defensively when it has no bikeId (pre-migration data)", async () => {
    mocks.getAllReminders.mockResolvedValue([
      { id: "r3", pk: "rider@example.com", intervalType: "mileage", intervalValue: 500, baseMileage: 0, notifiedAt: null, date: "2024-01-01" },
    ]);
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();
    expect(body).toEqual({ ok: true, checked: 1, sent: 0, notified: 0 });
    expect(mocks.getBike).not.toHaveBeenCalled();
  });

  it("skips a reminder whose bike no longer exists", async () => {
    mocks.getAllReminders.mockResolvedValue([
      { id: "r4", pk: "rider@example.com", bikeId: "bike-1", intervalType: "mileage", intervalValue: 500, baseMileage: 0, notifiedAt: null, date: "2024-01-01" },
    ]);
    mocks.getBike.mockResolvedValue(null);
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();
    expect(body.sent).toBe(0);
    expect(mocks.sendReminderEmail).not.toHaveBeenCalled();
  });

  it("does nothing for a reminder that isn't due soon or overdue yet", async () => {
    mocks.getAllReminders.mockResolvedValue([futureDateReminder()]);
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();
    expect(body).toEqual({ ok: true, checked: 1, sent: 0, notified: 0 });
    expect(mocks.sendReminderEmail).not.toHaveBeenCalled();
    expect(mocks.createReminderNotification).not.toHaveBeenCalled();
  });

  it("emails and marks notified for an overdue reminder, then persists a cronStatus summary", async () => {
    mocks.getAllReminders.mockResolvedValue([overdueDateReminder()]);
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, checked: 1, sent: 1, notified: 1 });
    expect(mocks.sendReminderEmail).toHaveBeenCalledWith(
      "rider@example.com", "Insurance renewal", expect.stringContaining("due")
    );
    expect(mocks.markReminderNotified).toHaveBeenCalledWith("rider@example.com", "r1");
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      id: "cronStatus::reminders", pk: "system", type: "cronStatus", checked: 1, sent: 1, notified: 1,
    }));
  });

  it("checks but does not email a free account's overdue reminder, and leaves it un-notified so upgrading later still sends it", async () => {
    mocks.isPro.mockResolvedValue(false);
    mocks.getAllReminders.mockResolvedValue([overdueDateReminder()]);
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();

    expect(body).toEqual({ ok: true, checked: 1, sent: 0, notified: 1 });
    expect(mocks.sendReminderEmail).not.toHaveBeenCalled();
    expect(mocks.markReminderNotified).not.toHaveBeenCalled();
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
    expect(body).toEqual({ ok: true, checked: 2, sent: 1, notified: 2, failed: 1 });
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
  // `if (!reminder.notifiedAt ...)` gate, combined with
  // markReminderNotified genuinely persisting, is enough on its own: a
  // stateful fake (not a fresh mock per call) is what makes the second
  // POST actually see the first POST's write, the same way two real
  // invocations against real Cosmos would.
  it("running the cron twice in a row only ever sends the same overdue reminder's email (and bell notification) once", async () => {
    const reminder = overdueDateReminder() as Omit<ReturnType<typeof overdueDateReminder>, "notifiedAt" | "overdueBellNotifiedAt"> & {
      notifiedAt: string | null;
      overdueBellNotifiedAt: string | null;
    };
    mocks.getAllReminders.mockImplementation(async () => [reminder]);
    mocks.markReminderNotified.mockImplementation(async (_email: string, id: string) => {
      if (id === reminder.id) reminder.notifiedAt = new Date().toISOString();
    });
    mocks.markReminderOverdueBellNotified.mockImplementation(async (_email: string, id: string) => {
      if (id === reminder.id) reminder.overdueBellNotifiedAt = new Date().toISOString();
    });

    const first = await POST(request({ authorization: "Bearer top-secret" }));
    expect(await first.json()).toEqual({ ok: true, checked: 1, sent: 1, notified: 1 });

    const second = await POST(request({ authorization: "Bearer top-secret" }));
    expect(await second.json()).toEqual({ ok: true, checked: 1, sent: 0, notified: 0 });

    expect(mocks.sendReminderEmail).toHaveBeenCalledTimes(1);
    expect(mocks.createReminderNotification).toHaveBeenCalledTimes(1);
  });

  // ── In-app bell notifications (every account, not just Pro) ─────────

  describe("bell notifications", () => {
    it("creates a due-soon bell notification, available to a free account, and marks it", async () => {
      mocks.isPro.mockResolvedValue(false);
      mocks.getAllReminders.mockResolvedValue([dueSoonDateReminder()]);

      const response = await POST(request({ authorization: "Bearer top-secret" }));
      const body = await response.json();

      expect(body).toEqual({ ok: true, checked: 1, sent: 0, notified: 1 });
      expect(mocks.createReminderNotification).toHaveBeenCalledWith("rider@example.com", {
        title: "MOT",
        body: expect.stringContaining("Due soon for"),
      });
      expect(mocks.markReminderDueSoonBellNotified).toHaveBeenCalledWith("rider@example.com", "r6");
      expect(mocks.markReminderOverdueBellNotified).not.toHaveBeenCalled();
    });

    it("names the vehicle by nickname when set, otherwise make/model", async () => {
      mocks.getBike.mockResolvedValue({ ...bike, nickname: "The Beast" });
      mocks.getAllReminders.mockResolvedValue([dueSoonDateReminder()]);

      await POST(request({ authorization: "Bearer top-secret" }));

      expect(mocks.createReminderNotification).toHaveBeenCalledWith("rider@example.com", {
        title: "MOT",
        body: expect.stringContaining("The Beast"),
      });
    });

    it("does not re-create a due-soon bell notification once already marked", async () => {
      mocks.getAllReminders.mockResolvedValue([dueSoonDateReminder({ dueSoonBellNotifiedAt: "2025-01-01T00:00:00.000Z" })]);

      const response = await POST(request({ authorization: "Bearer top-secret" }));
      const body = await response.json();

      expect(body).toEqual({ ok: true, checked: 1, sent: 0, notified: 0 });
      expect(mocks.createReminderNotification).not.toHaveBeenCalled();
    });

    it("creates an overdue bell notification for a free account, independent of the Pro-gated email", async () => {
      mocks.isPro.mockResolvedValue(false);
      mocks.getAllReminders.mockResolvedValue([overdueDateReminder()]);

      const response = await POST(request({ authorization: "Bearer top-secret" }));
      const body = await response.json();

      expect(body).toEqual({ ok: true, checked: 1, sent: 0, notified: 1 });
      expect(mocks.createReminderNotification).toHaveBeenCalledWith("rider@example.com", {
        title: "Insurance renewal",
        body: expect.stringContaining("Overdue for"),
      });
      expect(mocks.markReminderOverdueBellNotified).toHaveBeenCalledWith("rider@example.com", "r1");
      expect(mocks.sendReminderEmail).not.toHaveBeenCalled();
    });

    it("does not re-create an overdue bell notification once already marked", async () => {
      mocks.getAllReminders.mockResolvedValue([overdueDateReminder({ overdueBellNotifiedAt: "2025-01-01T00:00:00.000Z" })]);

      const response = await POST(request({ authorization: "Bearer top-secret" }));
      const body = await response.json();

      // The email can still fire (gated separately by notifiedAt), just
      // not a second bell notification for the same transition.
      expect(body).toEqual({ ok: true, checked: 1, sent: 1, notified: 0 });
      expect(mocks.createReminderNotification).not.toHaveBeenCalled();
    });
  });

  // Car reminders - mirrors every bike-side case above (see this file's
  // own header note on the route: getAllCarReminders/getCarById were
  // real, working code that nothing ever called before this pass, so a
  // car owner's overdue reminders were silently never emailed).
  describe("car reminders", () => {
    it("still checks an already-emailed car reminder, but never re-emails it", async () => {
      mocks.getAllCarReminders.mockResolvedValue([overdueDateCarReminder({ notifiedAt: "2025-01-01T00:00:00.000Z", overdueBellNotifiedAt: "2025-01-01T00:00:00.000Z" })]);
      const response = await POST(request({ authorization: "Bearer top-secret" }));
      const body = await response.json();
      expect(body).toEqual({ ok: true, checked: 1, sent: 0, notified: 0 });
      expect(mocks.sendReminderEmail).not.toHaveBeenCalled();
    });

    it("skips a car reminder defensively when it has no carId (pre-migration data)", async () => {
      mocks.getAllCarReminders.mockResolvedValue([
        { id: "cr3", pk: "driver@example.com", intervalType: "mileage", intervalValue: 500, baseMileage: 0, notifiedAt: null, date: "2024-01-01" },
      ]);
      const response = await POST(request({ authorization: "Bearer top-secret" }));
      const body = await response.json();
      expect(body).toEqual({ ok: true, checked: 1, sent: 0, notified: 0 });
      expect(mocks.getCarById).not.toHaveBeenCalled();
    });

    it("skips a car reminder whose car no longer exists", async () => {
      mocks.getAllCarReminders.mockResolvedValue([
        { id: "cr4", pk: "driver@example.com", carId: "car-1", intervalType: "mileage", intervalValue: 500, baseMileage: 0, notifiedAt: null, date: "2024-01-01" },
      ]);
      mocks.getCarById.mockResolvedValue(null);
      const response = await POST(request({ authorization: "Bearer top-secret" }));
      const body = await response.json();
      expect(body.sent).toBe(0);
      expect(mocks.sendReminderEmail).not.toHaveBeenCalled();
    });

    it("does nothing for a car reminder that isn't due soon or overdue yet", async () => {
      const future = new Date(Date.now() + 60 * 86_400_000).toISOString();
      mocks.getAllCarReminders.mockResolvedValue([
        overdueDateCarReminder({ id: "cr2", name: "MOT", exactDate: future }),
      ]);
      const response = await POST(request({ authorization: "Bearer top-secret" }));
      const body = await response.json();
      expect(body).toEqual({ ok: true, checked: 1, sent: 0, notified: 0 });
      expect(mocks.sendReminderEmail).not.toHaveBeenCalled();
    });

    it("emails and marks notified for an overdue car reminder, then persists a cronStatus summary", async () => {
      mocks.getAllCarReminders.mockResolvedValue([overdueDateCarReminder()]);
      const response = await POST(request({ authorization: "Bearer top-secret" }));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ ok: true, checked: 1, sent: 1, notified: 1 });
      expect(mocks.sendReminderEmail).toHaveBeenCalledWith(
        "driver@example.com", "Insurance renewal", expect.stringContaining("due")
      );
      expect(mocks.markCarReminderNotified).toHaveBeenCalledWith("driver@example.com", "cr1");
      expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
        id: "cronStatus::reminders", pk: "system", type: "cronStatus", checked: 1, sent: 1, notified: 1,
      }));
    });

    it("checks but does not email a free account's overdue car reminder, and leaves it un-notified so upgrading later still sends it", async () => {
      mocks.isPro.mockResolvedValue(false);
      mocks.getAllCarReminders.mockResolvedValue([overdueDateCarReminder()]);
      const response = await POST(request({ authorization: "Bearer top-secret" }));
      const body = await response.json();

      expect(body).toEqual({ ok: true, checked: 1, sent: 0, notified: 1 });
      expect(mocks.sendReminderEmail).not.toHaveBeenCalled();
      expect(mocks.markCarReminderNotified).not.toHaveBeenCalled();
    });

    it("creates a due-soon bell notification for a car reminder", async () => {
      mocks.getAllCarReminders.mockResolvedValue([dueSoonDateCarReminder()]);

      const response = await POST(request({ authorization: "Bearer top-secret" }));
      const body = await response.json();

      expect(body).toEqual({ ok: true, checked: 1, sent: 0, notified: 1 });
      expect(mocks.createReminderNotification).toHaveBeenCalledWith("driver@example.com", {
        title: "MOT",
        body: expect.stringContaining("Due soon for"),
      });
      expect(mocks.markCarReminderDueSoonBellNotified).toHaveBeenCalledWith("driver@example.com", "cr6");
    });

    it("isolates a single failed car reminder send and still checks/sends every other reminder in the run", async () => {
      mocks.getAllCarReminders.mockResolvedValue([
        overdueDateCarReminder({ id: "cr1", pk: "first@example.com" }),
        overdueDateCarReminder({ id: "cr5", pk: "second@example.com", name: "Tax renewal" }),
      ]);
      mocks.sendReminderEmail.mockImplementation(async (email: string) => {
        if (email === "first@example.com") throw new Error("Resend API down");
      });

      const response = await POST(request({ authorization: "Bearer top-secret" }));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ ok: true, checked: 2, sent: 1, notified: 2, failed: 1 });
      expect(mocks.sendReminderEmail).toHaveBeenCalledWith("second@example.com", "Tax renewal", expect.anything());
      expect(mocks.markCarReminderNotified).toHaveBeenCalledWith("second@example.com", "cr5");
      expect(mocks.markCarReminderNotified).not.toHaveBeenCalledWith("first@example.com", "cr1");
    });

    // The two vehicle kinds share exactly one run/one cronStatus doc, not
    // two independently-tracked ones - a bike reminder and a car reminder
    // both overdue in the same run must combine into the same totals.
    it("combines bike and car reminders into the same checked/sent totals and the same cronStatus doc", async () => {
      mocks.getAllReminders.mockResolvedValue([overdueDateReminder()]);
      mocks.getAllCarReminders.mockResolvedValue([overdueDateCarReminder()]);

      const response = await POST(request({ authorization: "Bearer top-secret" }));
      const body = await response.json();

      expect(body).toEqual({ ok: true, checked: 2, sent: 2, notified: 2 });
      expect(mocks.sendReminderEmail).toHaveBeenCalledWith("rider@example.com", "Insurance renewal", expect.anything());
      expect(mocks.sendReminderEmail).toHaveBeenCalledWith("driver@example.com", "Insurance renewal", expect.anything());
      expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
        id: "cronStatus::reminders", checked: 2, sent: 2,
      }));
    });
  });
});
