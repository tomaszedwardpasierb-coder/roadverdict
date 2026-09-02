import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getShareLinksNeedingFollowUp: vi.fn(),
  markShareLinkFollowUpSent: vi.fn(),
  getBike: vi.fn(),
  isBikeReadOnly: vi.fn(),
  hasActiveTransferRequestForBike: vi.fn(),
  sendHistoryFollowUpEmail: vi.fn(),
}));

vi.mock("@/lib/tracker/shareLink", () => ({
  getShareLinksNeedingFollowUp: mocks.getShareLinksNeedingFollowUp,
  markShareLinkFollowUpSent: mocks.markShareLinkFollowUpSent,
}));
vi.mock("@/lib/tracker/bike", () => ({
  getBike: mocks.getBike,
  isBikeReadOnly: mocks.isBikeReadOnly,
}));
vi.mock("@/lib/tracker/bikeTransferRequest", () => ({
  hasActiveTransferRequestForBike: mocks.hasActiveTransferRequestForBike,
}));
vi.mock("@/lib/resend", () => ({ sendHistoryFollowUpEmail: mocks.sendHistoryFollowUpEmail }));

import { POST } from "@/app/api/cron/send-history-follow-ups/route";

function request(headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/cron/send-history-follow-ups", { method: "POST", headers });
}

function link(overrides: Record<string, unknown> = {}) {
  return {
    id: "token-1", email: "owner@example.com", bikeId: "bike-1", recipientEmail: "buyer@example.com",
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const bike = { make: "Yamaha", model: "MT-07", year: 2020, isCustomBuild: false };

describe("POST /api/cron/send-history-follow-ups", () => {
  const originalSecret = process.env.CRON_SECRET;
  const originalAppUrl = process.env.APP_URL;

  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    process.env.CRON_SECRET = "top-secret";
    delete process.env.APP_URL;
    mocks.getShareLinksNeedingFollowUp.mockResolvedValue([]);
    mocks.markShareLinkFollowUpSent.mockResolvedValue(undefined);
    mocks.getBike.mockResolvedValue(bike);
    mocks.isBikeReadOnly.mockReturnValue(false);
    mocks.hasActiveTransferRequestForBike.mockResolvedValue(false);
    mocks.sendHistoryFollowUpEmail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
    process.env.APP_URL = originalAppUrl;
  });

  it("rejects a request with no authorization header", async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.getShareLinksNeedingFollowUp).not.toHaveBeenCalled();
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

  it("no-ops cleanly when there are no candidate links", async () => {
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ checked: 0, sent: 0, skipped: 0 });
  });

  it("skips (without marking) a candidate that has no recipient email", async () => {
    mocks.getShareLinksNeedingFollowUp.mockResolvedValue([link({ recipientEmail: undefined })]);
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    await expect(response.json()).resolves.toEqual({ checked: 1, sent: 0, skipped: 1 });
    expect(mocks.markShareLinkFollowUpSent).not.toHaveBeenCalled();
    expect(mocks.sendHistoryFollowUpEmail).not.toHaveBeenCalled();
  });

  it("marks processed without emailing when the bike has since been deleted", async () => {
    mocks.getShareLinksNeedingFollowUp.mockResolvedValue([link()]);
    mocks.getBike.mockResolvedValue(null);
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    await expect(response.json()).resolves.toEqual({ checked: 1, sent: 0, skipped: 1 });
    expect(mocks.markShareLinkFollowUpSent).toHaveBeenCalledWith("token-1");
    expect(mocks.sendHistoryFollowUpEmail).not.toHaveBeenCalled();
  });

  it("marks processed without emailing when the bike is already read-only (handed off)", async () => {
    mocks.getShareLinksNeedingFollowUp.mockResolvedValue([link()]);
    mocks.isBikeReadOnly.mockReturnValue(true);
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    await expect(response.json()).resolves.toEqual({ checked: 1, sent: 0, skipped: 1 });
    expect(mocks.markShareLinkFollowUpSent).toHaveBeenCalledWith("token-1");
    expect(mocks.sendHistoryFollowUpEmail).not.toHaveBeenCalled();
  });

  it("marks processed without emailing when the bike already has an active transfer request", async () => {
    mocks.getShareLinksNeedingFollowUp.mockResolvedValue([link()]);
    mocks.hasActiveTransferRequestForBike.mockResolvedValue(true);
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    await expect(response.json()).resolves.toEqual({ checked: 1, sent: 0, skipped: 1 });
    expect(mocks.sendHistoryFollowUpEmail).not.toHaveBeenCalled();
  });

  it("sends the follow-up email and marks it sent for an eligible link", async () => {
    mocks.getShareLinksNeedingFollowUp.mockResolvedValue([link()]);
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    await expect(response.json()).resolves.toEqual({ checked: 1, sent: 1, skipped: 0 });
    expect(mocks.sendHistoryFollowUpEmail).toHaveBeenCalledWith({
      recipientEmail: "buyer@example.com",
      bikeSummary: { make: "Yamaha", model: "MT-07", year: 2020, isCustomBuild: false },
      reportUrl: "https://roadverdict.co.uk/report/token-1/detailed",
    });
    expect(mocks.markShareLinkFollowUpSent).toHaveBeenCalledWith("token-1");
  });

  it("builds the report URL from APP_URL when it's configured", async () => {
    process.env.APP_URL = "https://staging.roadverdict.co.uk";
    mocks.getShareLinksNeedingFollowUp.mockResolvedValue([link()]);
    await POST(request({ authorization: "Bearer top-secret" }));
    expect(mocks.sendHistoryFollowUpEmail).toHaveBeenCalledWith(expect.objectContaining({
      reportUrl: "https://staging.roadverdict.co.uk/report/token-1/detailed",
    }));
  });

  // Explicit guarantee, matching this app's usual batch convention (see
  // commit-receipt-items): one recipient's send failing must not cost every
  // other eligible link in the same run its chance to be followed up on.
  // The failed one is deliberately left unmarked so tomorrow's run retries it.
  it("continues past a single failed send and still processes the rest of the batch", async () => {
    mocks.getShareLinksNeedingFollowUp.mockResolvedValue([
      link({ id: "token-fail", recipientEmail: "fails@example.com" }),
      link({ id: "token-ok", recipientEmail: "ok@example.com" }),
    ]);
    mocks.sendHistoryFollowUpEmail.mockImplementation(async (params: { recipientEmail: string }) => {
      if (params.recipientEmail === "fails@example.com") throw new Error("Resend rejected");
    });

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ checked: 2, sent: 1, skipped: 0 });
    expect(mocks.markShareLinkFollowUpSent).not.toHaveBeenCalledWith("token-fail");
    expect(mocks.markShareLinkFollowUpSent).toHaveBeenCalledWith("token-ok");
  });

  // Idempotency: a scheduler retry or a duplicate trigger must never
  // send the same buyer a second follow-up email. A stateful fake (not
  // a fresh mock per call) is what makes this a genuine test of that -
  // getShareLinksNeedingFollowUp's real query excludes anything with
  // followUpSentAt already set, so the fake re-filters the same
  // underlying array on every call exactly like the real IS_DEFINED
  // check would, and markShareLinkFollowUpSent's fake actually persists
  // that field onto it.
  it("running the cron twice in a row only ever emails the same eligible link once", async () => {
    const links = [link() as ReturnType<typeof link> & { followUpSentAt?: string }];
    mocks.getShareLinksNeedingFollowUp.mockImplementation(async () => links.filter((l) => !l.followUpSentAt));
    mocks.markShareLinkFollowUpSent.mockImplementation(async (token: string) => {
      const match = links.find((l) => l.id === token);
      if (match) match.followUpSentAt = new Date().toISOString();
    });

    const first = await POST(request({ authorization: "Bearer top-secret" }));
    await expect(first.json()).resolves.toEqual({ checked: 1, sent: 1, skipped: 0 });

    const second = await POST(request({ authorization: "Bearer top-secret" }));
    await expect(second.json()).resolves.toEqual({ checked: 0, sent: 0, skipped: 0 });

    expect(mocks.sendHistoryFollowUpEmail).toHaveBeenCalledTimes(1);
  });
});
