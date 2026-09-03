import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  deleteAccount: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/tracker/userAccount", () => ({ deleteAccount: mocks.deleteAccount }));

import { POST } from "@/app/api/tomasz/accounts/delete/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tomasz/accounts/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/tomasz/accounts/delete", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.deleteAccount.mockResolvedValue(undefined);
  });

  it("rejects a non-admin request", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await POST(request(JSON.stringify({ email: "rider@example.com", confirmEmail: "rider@example.com" })));
    expect(response.status).toBe(401);
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it("rejects when confirmEmail is missing entirely", async () => {
    const response = await POST(request(JSON.stringify({ email: "rider@example.com" })));
    expect(response.status).toBe(400);
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  // The one real security property this route has: a request that
  // somehow skips the client's typed-confirmation UI (a forged or
  // replayed request) still can't delete anything without the matching
  // confirmation email server-side.
  it("rejects when confirmEmail doesn't match email, even case/whitespace aside", async () => {
    const response = await POST(request(JSON.stringify({ email: "rider@example.com", confirmEmail: "someone-else@example.com" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Confirmation email doesn't match." });
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it("accepts a confirmEmail that matches after trimming and case-normalizing", async () => {
    const response = await POST(request(JSON.stringify({ email: "Rider@Example.com", confirmEmail: "  rider@example.com  " })));
    expect(response.status).toBe(200);
    expect(mocks.deleteAccount).toHaveBeenCalledWith("rider@example.com");
  });

  it("returns 500 (not the raw error) and logs it when deleteAccount itself throws", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.deleteAccount.mockRejectedValue(new Error("Cosmos write conflict"));

    const response = await POST(request(JSON.stringify({ email: "rider@example.com", confirmEmail: "rider@example.com" })));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Something went wrong deleting this account. Check the logs before retrying.",
    });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
