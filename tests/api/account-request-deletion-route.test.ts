import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  requestAccountDeletion: vi.fn(),
  sendAccountDeletionRequestedEmail: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/userAccount", () => ({ requestAccountDeletion: mocks.requestAccountDeletion }));
vi.mock("@/lib/resend", () => ({ sendAccountDeletionRequestedEmail: mocks.sendAccountDeletionRequestedEmail }));

import { POST } from "@/app/api/account/request-deletion/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/account/request-deletion", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/account/request-deletion", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.requestAccountDeletion.mockResolvedValue({ deleteAfter: "2026-10-08T00:00:00.000Z" });
    mocks.sendAccountDeletionRequestedEmail.mockResolvedValue(undefined);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify({ confirmText: "DELETE" })));
    expect(response.status).toBe(401);
    expect(mocks.requestAccountDeletion).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
    const response = await POST(request("not-json"));
    expect(response.status).toBe(400);
  });

  // The real safeguard - a client-side-only "type DELETE" gate would be
  // trivially bypassed by anyone calling this route directly.
  it("rejects when confirmText isn't exactly \"DELETE\", even for a signed-in user", async () => {
    mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
    const response = await POST(request(JSON.stringify({ confirmText: "delete" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Please type "DELETE" to confirm.' });
    expect(mocks.requestAccountDeletion).not.toHaveBeenCalled();
  });

  it("schedules deletion and sends the confirmation email on a valid request", async () => {
    mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
    const response = await POST(request(JSON.stringify({ confirmText: "DELETE" })));

    expect(response.status).toBe(200);
    expect(mocks.requestAccountDeletion).toHaveBeenCalledWith("rider@example.com");
    expect(mocks.sendAccountDeletionRequestedEmail).toHaveBeenCalledWith("rider@example.com", expect.any(String));
    const data = await response.json();
    expect(data.deleteAfter).toBe("2026-10-08T00:00:00.000Z");
  });

  it("still succeeds even when the confirmation email fails to send - the deletion request itself already went through", async () => {
    mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
    mocks.sendAccountDeletionRequestedEmail.mockRejectedValue(new Error("Resend is down"));

    const response = await POST(request(JSON.stringify({ confirmText: "DELETE" })));

    expect(response.status).toBe(200);
    expect(mocks.requestAccountDeletion).toHaveBeenCalled();
  });
});
