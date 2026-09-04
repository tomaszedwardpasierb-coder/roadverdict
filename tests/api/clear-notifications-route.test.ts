import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  clearNotifications: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/tracker/notification", () => ({ clearNotifications: mocks.clearNotifications }));

import { POST } from "@/app/api/tomasz/clear-notifications/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tomasz/clear-notifications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/tomasz/clear-notifications", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.clearNotifications.mockResolvedValue(5);
  });

  it("rejects a non-admin request", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await POST(request(JSON.stringify({ broadcasts: "all", recipients: "all" })));
    expect(response.status).toBe(401);
    expect(mocks.clearNotifications).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(request("not-json"));
    expect(response.status).toBe(400);
  });

  it("rejects a request missing the broadcasts field", async () => {
    const response = await POST(request(JSON.stringify({ recipients: "all" })));
    expect(response.status).toBe(400);
    expect(mocks.clearNotifications).not.toHaveBeenCalled();
  });

  it("rejects a request missing the recipients field", async () => {
    const response = await POST(request(JSON.stringify({ broadcasts: "all" })));
    expect(response.status).toBe(400);
    expect(mocks.clearNotifications).not.toHaveBeenCalled();
  });

  it("rejects an empty specific-broadcasts array", async () => {
    const response = await POST(request(JSON.stringify({ broadcasts: [], recipients: "all" })));
    expect(response.status).toBe(400);
    expect(mocks.clearNotifications).not.toHaveBeenCalled();
  });

  it("rejects an empty specific-recipients array", async () => {
    const response = await POST(request(JSON.stringify({ broadcasts: "all", recipients: [] })));
    expect(response.status).toBe(400);
    expect(mocks.clearNotifications).not.toHaveBeenCalled();
  });

  it("clears with 'all'/'all' and reports the deleted count", async () => {
    const response = await POST(request(JSON.stringify({ broadcasts: "all", recipients: "all" })));
    expect(response.status).toBe(200);
    expect(mocks.clearNotifications).toHaveBeenCalledWith({ broadcasts: "all", recipients: "all" });
    await expect(response.json()).resolves.toEqual({ ok: true, deletedCount: 5 });
  });

  it("passes through specific broadcasts and recipients unchanged", async () => {
    const broadcasts = [{ title: "T", body: "B", createdAt: "2025-01-01T00:00:00.000Z" }];
    const recipients = ["a@example.com"];
    await POST(request(JSON.stringify({ broadcasts, recipients })));
    expect(mocks.clearNotifications).toHaveBeenCalledWith({ broadcasts, recipients });
  });

  it("returns 500 when clearing throws", async () => {
    mocks.clearNotifications.mockRejectedValue(new Error("boom"));
    const response = await POST(request(JSON.stringify({ broadcasts: "all", recipients: "all" })));
    expect(response.status).toBe(500);
  });
});
