import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  purgeOldNotifications: vi.fn(),
  purgeStalePendingScanBatches: vi.fn(),
  pruneKnowledgeBaseVersions: vi.fn(),
  prunePersonalityVersions: vi.fn(),
  purgeOldImpersonationLogs: vi.fn(),
}));

vi.mock("@/lib/tracker/notification", () => ({ purgeOldNotifications: mocks.purgeOldNotifications }));
vi.mock("@/lib/tracker/pendingScanBatch", () => ({ purgeStalePendingScanBatches: mocks.purgeStalePendingScanBatches }));
vi.mock("@/lib/tracker/assistantConfig", () => ({
  pruneKnowledgeBaseVersions: mocks.pruneKnowledgeBaseVersions,
  prunePersonalityVersions: mocks.prunePersonalityVersions,
}));
vi.mock("@/lib/admin/impersonation", () => ({ purgeOldImpersonationLogs: mocks.purgeOldImpersonationLogs }));

import { POST } from "@/app/api/cron/purge-stale-data/route";

function request(headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/cron/purge-stale-data", {
    method: "POST",
    headers,
  });
}

describe("POST /api/cron/purge-stale-data", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    process.env.CRON_SECRET = "top-secret";
    mocks.purgeOldNotifications.mockResolvedValue(1);
    mocks.purgeStalePendingScanBatches.mockResolvedValue(2);
    mocks.pruneKnowledgeBaseVersions.mockResolvedValue(3);
    mocks.prunePersonalityVersions.mockResolvedValue(4);
    mocks.purgeOldImpersonationLogs.mockResolvedValue(5);
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it("rejects a request with no authorization header at all", async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.purgeOldNotifications).not.toHaveBeenCalled();
  });

  it("rejects a request bearing the wrong secret", async () => {
    const response = await POST(request({ authorization: "Bearer wrong-secret" }));
    expect(response.status).toBe(401);
    expect(mocks.purgeOldNotifications).not.toHaveBeenCalled();
  });

  it("rejects every request, even with a correct-looking header, when CRON_SECRET isn't configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(401);
    expect(mocks.purgeOldNotifications).not.toHaveBeenCalled();
  });

  it("runs every purge and reports a per-type breakdown", async () => {
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      deletedCounts: {
        notifications: 1,
        pendingScanBatches: 2,
        knowledgeBaseVersions: 3,
        personalityVersions: 4,
        impersonationLogs: 5,
      },
    });
  });

  it("degrades to a graceful JSON 500 when any purge fails, instead of propagating", async () => {
    mocks.pruneKnowledgeBaseVersions.mockRejectedValue(new Error("Cosmos unavailable"));
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Unexpected error purging stale data");
    expect(body.detail).toBe("Cosmos unavailable");
  });
});
