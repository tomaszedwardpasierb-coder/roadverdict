import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  revokeAllSessions: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/tracker/userAccount", () => ({ revokeAllSessions: mocks.revokeAllSessions }));

import { POST } from "@/app/api/tomasz/accounts/revoke-sessions/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tomasz/accounts/revoke-sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/tomasz/accounts/revoke-sessions", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.revokeAllSessions.mockResolvedValue(3);
  });

  it("rejects a non-admin request", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await POST(request(JSON.stringify({ email: "rider@example.com" })));
    expect(response.status).toBe(401);
    expect(mocks.revokeAllSessions).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(request("not-json"));
    expect(response.status).toBe(400);
  });

  it("rejects a missing email", async () => {
    const response = await POST(request(JSON.stringify({})));
    expect(response.status).toBe(400);
    expect(mocks.revokeAllSessions).not.toHaveBeenCalled();
  });

  it("revokes every session for the given email and reports the count", async () => {
    const response = await POST(request(JSON.stringify({ email: "rider@example.com" })));
    expect(response.status).toBe(200);
    expect(mocks.revokeAllSessions).toHaveBeenCalledWith("rider@example.com");
    await expect(response.json()).resolves.toEqual({ ok: true, revokedCount: 3 });
  });

  it("returns 500 when revocation throws", async () => {
    mocks.revokeAllSessions.mockRejectedValue(new Error("boom"));
    const response = await POST(request(JSON.stringify({ email: "rider@example.com" })));
    expect(response.status).toBe(500);
  });
});
