import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  updateAutoEnableOnboarding: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));
// updateAutoEnableOnboarding is already covered by its own unit tests
// (tests/unit/assistantConfig.test.ts) - mocked here so this stays
// focused on the route's own auth-gating and input validation.
vi.mock("@/lib/tracker/assistantConfig", () => ({ updateAutoEnableOnboarding: mocks.updateAutoEnableOnboarding }));

import { POST } from "@/app/api/tomasz/assistant-config/auto-enable-onboarding/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tomasz/assistant-config/auto-enable-onboarding", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/tomasz/assistant-config/auto-enable-onboarding", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.updateAutoEnableOnboarding.mockResolvedValue(undefined);
  });

  it("rejects a request with no admin session at all", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await POST(request(JSON.stringify({ enabled: true })));
    expect(response.status).toBe(401);
    expect(mocks.updateAutoEnableOnboarding).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON even when signed in as admin", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(request("not-json"));
    expect(response.status).toBe(400);
    expect(mocks.updateAutoEnableOnboarding).not.toHaveBeenCalled();
  });

  it("rejects a missing enabled field", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(request(JSON.stringify({})));
    expect(response.status).toBe(400);
    expect(mocks.updateAutoEnableOnboarding).not.toHaveBeenCalled();
  });

  it("rejects a non-boolean enabled value", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(request(JSON.stringify({ enabled: "yes" })));
    expect(response.status).toBe(400);
    expect(mocks.updateAutoEnableOnboarding).not.toHaveBeenCalled();
  });

  it("turns the setting on for an admin session", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(request(JSON.stringify({ enabled: true })));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.updateAutoEnableOnboarding).toHaveBeenCalledWith(true);
  });

  it("turns the setting off for an admin session", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(request(JSON.stringify({ enabled: false })));
    expect(response.status).toBe(200);
    expect(mocks.updateAutoEnableOnboarding).toHaveBeenCalledWith(false);
  });

  it("returns 500 without leaking internals when the underlying save throws", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.updateAutoEnableOnboarding.mockRejectedValue(new Error("cosmos unavailable"));
    const response = await POST(request(JSON.stringify({ enabled: true })));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to save." });
  });
});
