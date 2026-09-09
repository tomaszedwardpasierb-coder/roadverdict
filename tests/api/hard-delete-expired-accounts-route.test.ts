import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  upsert: vi.fn(),
  deleteAccount: vi.fn(),
  sendAccountDeletedEmail: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({ items: { query: mocks.query, upsert: mocks.upsert } }),
}));
vi.mock("@/lib/tracker/userAccount", () => ({ deleteAccount: mocks.deleteAccount }));
vi.mock("@/lib/resend", () => ({ sendAccountDeletedEmail: mocks.sendAccountDeletedEmail }));

import { POST } from "@/app/api/cron/hard-delete-expired-accounts/route";

function request(headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/cron/hard-delete-expired-accounts", { method: "POST", headers });
}

function expiredQuery(emails: string[]) {
  mocks.query.mockReturnValue({ fetchAll: () => Promise.resolve({ resources: emails.map((email) => ({ email })) }) });
}

describe("POST /api/cron/hard-delete-expired-accounts", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.upsert.mockResolvedValue(undefined);
    mocks.deleteAccount.mockResolvedValue(undefined);
    mocks.sendAccountDeletedEmail.mockResolvedValue(undefined);
    process.env.CRON_SECRET = "top-secret";
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it("rejects a request with no authorization header", async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong secret", async () => {
    const response = await POST(request({ authorization: "Bearer wrong" }));
    expect(response.status).toBe(401);
  });

  it("rejects every request when CRON_SECRET isn't configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(401);
  });

  it("no-ops cleanly when no account has an expired grace period", async () => {
    expiredQuery([]);
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, deleted: 0, deletedEmails: [] });
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it("only queries user docs whose pendingDeletionAt has actually passed", async () => {
    expiredQuery([]);
    await POST(request({ authorization: "Bearer top-secret" }));
    const queryArg = mocks.query.mock.calls[0][0];
    expect(queryArg.query).toContain("c.type = 'user'");
    expect(queryArg.query).toContain("c.pendingDeletionAt <= @now");
  });

  it("deletes every expired account and sends the final confirmation email for each", async () => {
    expiredQuery(["gone1@example.com", "gone2@example.com"]);
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();

    expect(body.deleted).toBe(2);
    expect(body.deletedEmails).toEqual(["gone1@example.com", "gone2@example.com"]);
    expect(mocks.deleteAccount).toHaveBeenCalledWith("gone1@example.com");
    expect(mocks.deleteAccount).toHaveBeenCalledWith("gone2@example.com");
    expect(mocks.sendAccountDeletedEmail).toHaveBeenCalledWith("gone1@example.com");
    expect(mocks.sendAccountDeletedEmail).toHaveBeenCalledWith("gone2@example.com");
  });

  it("still counts an account as deleted even when its confirmation email fails to send", async () => {
    expiredQuery(["gone@example.com"]);
    mocks.sendAccountDeletedEmail.mockRejectedValue(new Error("Resend is down"));

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();

    expect(body.deleted).toBe(1);
    expect(body.errors).toBeUndefined();
  });

  it("isolates a single account's deletion failure and still deletes the rest of the run", async () => {
    expiredQuery(["broken@example.com", "fine@example.com"]);
    mocks.deleteAccount.mockImplementation(async (email: string) => {
      if (email === "broken@example.com") throw new Error("Cosmos write failed");
    });

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.deleted).toBe(1);
    expect(body.deletedEmails).toEqual(["fine@example.com"]);
    expect(body.errors).toEqual([{ email: "broken@example.com", error: "Cosmos write failed" }]);
  });

  it("writes a cronStatus summary doc once the run completes", async () => {
    expiredQuery([]);
    await POST(request({ authorization: "Bearer top-secret" }));
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      id: "cronStatus::hardDeleteExpiredAccounts", pk: "system", type: "cronStatus",
    }));
  });
});
