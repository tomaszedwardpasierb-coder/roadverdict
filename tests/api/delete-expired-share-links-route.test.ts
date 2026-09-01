import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  deleteExpiredShareLinks: vi.fn(),
}));

vi.mock("@/lib/tracker/shareLink", () => ({
  deleteExpiredShareLinks: mocks.deleteExpiredShareLinks,
}));

import { POST } from "@/app/api/cron/delete-expired-share-links/route";

function request(headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/cron/delete-expired-share-links", {
    method: "POST",
    headers,
  });
}

describe("POST /api/cron/delete-expired-share-links", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    process.env.CRON_SECRET = "top-secret";
    mocks.deleteExpiredShareLinks.mockResolvedValue(0);
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it("rejects a request with no authorization header at all", async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.deleteExpiredShareLinks).not.toHaveBeenCalled();
  });

  it("rejects a request bearing the wrong secret", async () => {
    const response = await POST(request({ authorization: "Bearer wrong-secret" }));
    expect(response.status).toBe(401);
    expect(mocks.deleteExpiredShareLinks).not.toHaveBeenCalled();
  });

  it("rejects every request, even with a correct-looking header, when CRON_SECRET isn't configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(401);
    expect(mocks.deleteExpiredShareLinks).not.toHaveBeenCalled();
  });

  it("proceeds and reports zero deletions when nothing is expired", async () => {
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, deletedCount: 0 });
  });

  it("reports the deleted count from the underlying cleanup", async () => {
    mocks.deleteExpiredShareLinks.mockResolvedValue(7);
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, deletedCount: 7 });
  });

  it("degrades to a graceful JSON 500 when the cleanup fails, instead of propagating", async () => {
    mocks.deleteExpiredShareLinks.mockRejectedValue(new Error("Cosmos unavailable"));
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Unexpected error deleting expired share links");
    expect(body.detail).toBe("Cosmos unavailable");
  });
});
