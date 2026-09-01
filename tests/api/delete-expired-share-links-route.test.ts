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

  // BUG FINDING: unlike most other cron routes in this app, this handler has
  // no try/catch at all around its work. A failure here doesn't degrade to a
  // graceful JSON 500 - it propagates out of the route handler entirely.
  it("has no error handling: a failure in the cleanup propagates instead of yielding a JSON 500", async () => {
    mocks.deleteExpiredShareLinks.mockRejectedValue(new Error("Cosmos unavailable"));
    await expect(POST(request({ authorization: "Bearer top-secret" }))).rejects.toThrow("Cosmos unavailable");
  });
});
