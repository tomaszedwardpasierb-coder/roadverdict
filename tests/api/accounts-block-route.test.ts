import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  blockAccount: vi.fn(),
  unblockAccount: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/tracker/userAccount", () => ({
  blockAccount: mocks.blockAccount,
  unblockAccount: mocks.unblockAccount,
}));

import { POST } from "@/app/api/tomasz/accounts/block/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tomasz/accounts/block", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/tomasz/accounts/block", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.blockAccount.mockResolvedValue(undefined);
    mocks.unblockAccount.mockResolvedValue(undefined);
  });

  it("rejects a non-admin request", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await POST(request(JSON.stringify({ email: "rider@example.com", blocked: true })));
    expect(response.status).toBe(401);
    expect(mocks.blockAccount).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(request("not-json"));
    expect(response.status).toBe(400);
  });

  it("rejects a missing email", async () => {
    const response = await POST(request(JSON.stringify({ blocked: true })));
    expect(response.status).toBe(400);
  });

  it("blocks the account, normalizing the email, when blocked: true", async () => {
    const response = await POST(request(JSON.stringify({ email: "  Rider@Example.com  ", blocked: true })));
    expect(response.status).toBe(200);
    expect(mocks.blockAccount).toHaveBeenCalledWith("rider@example.com");
    expect(mocks.unblockAccount).not.toHaveBeenCalled();
  });

  it("unblocks the account when blocked: false", async () => {
    const response = await POST(request(JSON.stringify({ email: "rider@example.com", blocked: false })));
    expect(response.status).toBe(200);
    expect(mocks.unblockAccount).toHaveBeenCalledWith("rider@example.com");
    expect(mocks.blockAccount).not.toHaveBeenCalled();
  });

  it("returns 400 with the real error message when the account doesn't exist", async () => {
    mocks.blockAccount.mockRejectedValue(new Error("No account found for rider@example.com."));
    const response = await POST(request(JSON.stringify({ email: "rider@example.com", blocked: true })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "No account found for rider@example.com." });
  });
});
