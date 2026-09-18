import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  updateFeedbackStatus: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/tracker/feedback", () => ({ updateFeedbackStatus: mocks.updateFeedbackStatus }));

import { PATCH } from "@/app/api/tomasz/feedback/[id]/status/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tomasz/feedback/f1/status", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("PATCH /api/tomasz/feedback/[id]/status", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.updateFeedbackStatus.mockResolvedValue(undefined);
  });

  it("rejects a request with no admin session", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await PATCH(request(JSON.stringify({ status: "resolved" })), { params: Promise.resolve({ id: "f1" }) });
    expect(response.status).toBe(401);
    expect(mocks.updateFeedbackStatus).not.toHaveBeenCalled();
  });

  it("rejects an invalid status", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await PATCH(request(JSON.stringify({ status: "archived" })), { params: Promise.resolve({ id: "f1" }) });
    expect(response.status).toBe(400);
    expect(mocks.updateFeedbackStatus).not.toHaveBeenCalled();
  });

  it("updates the given feedback id's status for an admin session", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await PATCH(request(JSON.stringify({ status: "resolved" })), { params: Promise.resolve({ id: "f1" }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.updateFeedbackStatus).toHaveBeenCalledWith("f1", "resolved");
  });

  it("returns 500 without leaking internals when the underlying update throws", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.updateFeedbackStatus.mockRejectedValue(new Error("cosmos unavailable"));
    const response = await PATCH(request(JSON.stringify({ status: "reviewed" })), { params: Promise.resolve({ id: "f1" }) });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Could not update status." });
  });
});
