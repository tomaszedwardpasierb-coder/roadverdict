import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  updateFuelPrice: vi.fn(),
  checkReminders: vi.fn(),
  backfillBikeId: vi.fn(),
  deleteExpiredShareLinks: vi.fn(),
  auditMileage: vi.fn(),
  purgeOrphanedReceiptRequests: vi.fn(),
  updateExchangeRates: vi.fn(),
  sendHistoryFollowUps: vi.fn(),
  backfillUsers: vi.fn(),
  seedAssistantConfig: vi.fn(),
  purgeStaleData: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/app/api/cron/update-fuel-price/route", () => ({ POST: mocks.updateFuelPrice }));
vi.mock("@/app/api/cron/check-reminders/route", () => ({ POST: mocks.checkReminders }));
vi.mock("@/app/api/cron/backfill-bike-id/route", () => ({ POST: mocks.backfillBikeId }));
vi.mock("@/app/api/cron/delete-expired-share-links/route", () => ({ POST: mocks.deleteExpiredShareLinks }));
vi.mock("@/app/api/cron/audit-mileage/route", () => ({ POST: mocks.auditMileage }));
vi.mock("@/app/api/cron/purge-orphaned-receipt-requests/route", () => ({ POST: mocks.purgeOrphanedReceiptRequests }));
vi.mock("@/app/api/cron/update-exchange-rates/route", () => ({ POST: mocks.updateExchangeRates }));
vi.mock("@/app/api/cron/send-history-follow-ups/route", () => ({ POST: mocks.sendHistoryFollowUps }));
vi.mock("@/app/api/cron/backfill-users/route", () => ({ POST: mocks.backfillUsers }));
vi.mock("@/app/api/cron/seed-assistant-config/route", () => ({ POST: mocks.seedAssistantConfig }));
vi.mock("@/app/api/cron/purge-stale-data/route", () => ({ POST: mocks.purgeStaleData }));

import { POST } from "@/app/api/admin/run-cron/[name]/route";

const VALID_NAME = "update-fuel-price";

function req(): Request {
  return new Request(`http://localhost/api/admin/run-cron/${VALID_NAME}`, { method: "POST" });
}

function jsonResponse(status: number, body: unknown) {
  return { status, json: async () => body } as Response;
}

describe("POST /api/admin/run-cron/[name]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.updateFuelPrice.mockResolvedValue(jsonResponse(200, { ok: true, ran: VALID_NAME }));
  });

  it("rejects a request with no admin session, and never calls any cron handler", async () => {
    mocks.getAdminSession.mockResolvedValue(false);

    const response = await POST(req(), { params: Promise.resolve({ name: VALID_NAME }) });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Not signed in." });
    expect(mocks.updateFuelPrice).not.toHaveBeenCalled();
  });

  it("rejects an unknown cron name even for an authenticated admin", async () => {
    mocks.getAdminSession.mockResolvedValue(true);

    const response = await POST(req(), { params: Promise.resolve({ name: "not-a-real-cron" }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Unknown cron." });
    expect(mocks.updateFuelPrice).not.toHaveBeenCalled();
  });

  // The allowlist (now the CRON_HANDLERS map's own keys) exists precisely so
  // this route can't be turned into an arbitrary internal-request proxy - a
  // path-traversal-shaped name must be rejected exactly like any other
  // unrecognised string, not partially matched against a real entry.
  it("rejects a path-traversal-shaped cron name", async () => {
    mocks.getAdminSession.mockResolvedValue(true);

    const response = await POST(req(), { params: Promise.resolve({ name: "../cron-secrets" }) });

    expect(response.status).toBe(400);
    expect(mocks.updateFuelPrice).not.toHaveBeenCalled();
  });

  it("rejects a cron name that only partially matches a real one", async () => {
    mocks.getAdminSession.mockResolvedValue(true);

    const response = await POST(req(), { params: Promise.resolve({ name: "update-fuel-price-extra" }) });

    expect(response.status).toBe(400);
    expect(mocks.updateFuelPrice).not.toHaveBeenCalled();
  });

  // The core fix: this used to be a real HTTP fetch back to the app's own
  // public URL, which could deadlock a low-concurrency deployment (this
  // request occupies the only worker while waiting on a second request that
  // needs a worker to even start) - the admin UI would show "Running…"
  // forever even after the job had actually finished. Calling the handler
  // directly, in-process, has no such dependency.
  it("calls the matching cron handler directly (no network fetch) with the bearer secret, for a valid, authenticated request", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const priorSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-cron-secret";

    try {
      const response = await POST(req(), { params: Promise.resolve({ name: VALID_NAME }) });

      expect(mocks.updateFuelPrice).toHaveBeenCalledTimes(1);
      const calledWith = mocks.updateFuelPrice.mock.calls[0][0] as Request;
      expect(calledWith.headers.get("authorization")).toBe("Bearer test-cron-secret");
      expect(calledWith.method).toBe("POST");
      expect(fetchSpy).not.toHaveBeenCalled();

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true, ran: VALID_NAME });
    } finally {
      process.env.CRON_SECRET = priorSecret;
      vi.unstubAllGlobals();
    }
  });

  it("forwards a non-2xx status from the underlying cron handler rather than masking it as success", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.updateFuelPrice.mockResolvedValue(jsonResponse(500, { error: "cron failed" }));

    const response = await POST(req(), { params: Promise.resolve({ name: VALID_NAME }) });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "cron failed" });
  });

  it.each([
    ["check-reminders", "checkReminders"],
    ["backfill-bike-id", "backfillBikeId"],
    ["delete-expired-share-links", "deleteExpiredShareLinks"],
    ["audit-mileage", "auditMileage"],
    ["purge-orphaned-receipt-requests", "purgeOrphanedReceiptRequests"],
    ["update-exchange-rates", "updateExchangeRates"],
    ["send-history-follow-ups", "sendHistoryFollowUps"],
    ["backfill-users", "backfillUsers"],
    ["seed-assistant-config", "seedAssistantConfig"],
    ["purge-stale-data", "purgeStaleData"],
  ])("routes %s to its own handler, not update-fuel-price's", async (name, mockKey) => {
    mocks.getAdminSession.mockResolvedValue(true);
    (mocks as unknown as Record<string, ReturnType<typeof vi.fn>>)[mockKey].mockResolvedValue(jsonResponse(200, { ok: true }));

    const response = await POST(req(), { params: Promise.resolve({ name }) });

    expect(response.status).toBe(200);
    expect((mocks as unknown as Record<string, ReturnType<typeof vi.fn>>)[mockKey]).toHaveBeenCalledTimes(1);
    expect(mocks.updateFuelPrice).not.toHaveBeenCalled();
  });
});
