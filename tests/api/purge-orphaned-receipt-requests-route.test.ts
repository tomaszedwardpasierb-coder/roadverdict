import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  purgeOrphanedReceiptRequests: vi.fn(),
}));

vi.mock("@/lib/tracker/receiptRequest", () => ({
  purgeOrphanedReceiptRequests: mocks.purgeOrphanedReceiptRequests,
}));

import { POST } from "@/app/api/cron/purge-orphaned-receipt-requests/route";

function request(headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/cron/purge-orphaned-receipt-requests", {
    method: "POST",
    headers,
  });
}

describe("POST /api/cron/purge-orphaned-receipt-requests", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    process.env.CRON_SECRET = "top-secret";
    mocks.purgeOrphanedReceiptRequests.mockResolvedValue(0);
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it("rejects a request with no authorization header at all", async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.purgeOrphanedReceiptRequests).not.toHaveBeenCalled();
  });

  it("rejects a request bearing the wrong secret", async () => {
    const response = await POST(request({ authorization: "Bearer wrong-secret" }));
    expect(response.status).toBe(401);
    expect(mocks.purgeOrphanedReceiptRequests).not.toHaveBeenCalled();
  });

  it("rejects every request, even with a correct-looking header, when CRON_SECRET isn't configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(401);
    expect(mocks.purgeOrphanedReceiptRequests).not.toHaveBeenCalled();
  });

  it("proceeds and reports zero deletions when there's nothing orphaned", async () => {
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, deletedCount: 0 });
  });

  it("reports the deleted count from the underlying purge", async () => {
    mocks.purgeOrphanedReceiptRequests.mockResolvedValue(3);
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, deletedCount: 3 });
  });

  // BUG FINDING: same gap as delete-expired-share-links - no try/catch at
  // all, so a failure propagates out of the handler instead of a JSON 500.
  it("has no error handling: a failure in the purge propagates instead of yielding a JSON 500", async () => {
    mocks.purgeOrphanedReceiptRequests.mockRejectedValue(new Error("Cosmos unavailable"));
    await expect(POST(request({ authorization: "Bearer top-secret" }))).rejects.toThrow("Cosmos unavailable");
  });
});
