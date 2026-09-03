import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  grantPremium: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/tracker/userAccount", () => ({ grantPremium: mocks.grantPremium }));

import { POST } from "@/app/api/tomasz/accounts/grant-premium/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tomasz/accounts/grant-premium", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const futureDate = new Date(Date.now() + 30 * 86_400_000).toISOString();

describe("POST /api/tomasz/accounts/grant-premium", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.grantPremium.mockResolvedValue(undefined);
  });

  it("rejects a non-admin request", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await POST(request(JSON.stringify({ email: "rider@example.com", expiresAt: futureDate })));
    expect(response.status).toBe(401);
    expect(mocks.grantPremium).not.toHaveBeenCalled();
  });

  it("rejects a missing email", async () => {
    const response = await POST(request(JSON.stringify({ expiresAt: futureDate })));
    expect(response.status).toBe(400);
  });

  it("rejects a missing expiry date", async () => {
    const response = await POST(request(JSON.stringify({ email: "rider@example.com" })));
    expect(response.status).toBe(400);
    expect(mocks.grantPremium).not.toHaveBeenCalled();
  });

  it("grants the plan with the normalized email and given expiry", async () => {
    const response = await POST(request(JSON.stringify({ email: "  Rider@Example.com  ", expiresAt: futureDate })));
    expect(response.status).toBe(200);
    expect(mocks.grantPremium).toHaveBeenCalledWith("rider@example.com", futureDate);
  });

  // The real cap-enforcement lives in grantPremium() itself
  // (userAccount.ts) - this route must surface whatever it throws
  // rather than re-validating (and potentially disagreeing with) the
  // same rule a second time.
  it("surfaces grantPremium's own validation error (e.g. the 3-year cap) as a 400", async () => {
    mocks.grantPremium.mockRejectedValue(new Error("Grants can't exceed 3 years."));
    const response = await POST(request(JSON.stringify({ email: "rider@example.com", expiresAt: futureDate })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Grants can't exceed 3 years." });
  });
});
