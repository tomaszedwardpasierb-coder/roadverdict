import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  revokePremium: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/tracker/userAccount", () => ({ revokePremium: mocks.revokePremium }));

import { POST } from "@/app/api/tomasz/accounts/revoke-premium/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tomasz/accounts/revoke-premium", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/tomasz/accounts/revoke-premium", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.revokePremium.mockResolvedValue(undefined);
  });

  it("rejects a non-admin request", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await POST(request(JSON.stringify({ email: "rider@example.com" })));
    expect(response.status).toBe(401);
    expect(mocks.revokePremium).not.toHaveBeenCalled();
  });

  it("rejects a missing email", async () => {
    const response = await POST(request(JSON.stringify({})));
    expect(response.status).toBe(400);
  });

  it("revokes the plan for the normalized email", async () => {
    const response = await POST(request(JSON.stringify({ email: "  Rider@Example.com  " })));
    expect(response.status).toBe(200);
    expect(mocks.revokePremium).toHaveBeenCalledWith("rider@example.com");
  });

  it("returns 400 with the real error message when the account doesn't exist", async () => {
    mocks.revokePremium.mockRejectedValue(new Error("No account found for rider@example.com."));
    const response = await POST(request(JSON.stringify({ email: "rider@example.com" })));
    expect(response.status).toBe(400);
  });
});
