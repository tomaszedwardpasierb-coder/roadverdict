import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  createBroadcastNotifications: vi.fn(),
  getAllUserEmails: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/tracker/notification", () => ({
  createBroadcastNotifications: mocks.createBroadcastNotifications,
  getAllUserEmails: mocks.getAllUserEmails,
}));
// getSafeRedirectPath is pure validation logic - used as-is (not
// mocked) so the route's open-redirect guard is exercised for real.

import { POST } from "@/app/api/tomasz/send-notification/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tomasz/send-notification", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const validBody = { title: "Heads up", message: "Something changed.", recipients: "all" };

describe("POST /api/tomasz/send-notification", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getAllUserEmails.mockResolvedValue(["a@example.com", "b@example.com"]);
    mocks.createBroadcastNotifications.mockResolvedValue(undefined);
  });

  it("rejects a non-admin request outright, without ever sending anything", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await POST(request(JSON.stringify(validBody)));
    expect(response.status).toBe(401);
    expect(mocks.createBroadcastNotifications).not.toHaveBeenCalled();
  });

  it("rejects a request with no admin session cookie at all", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await POST(request(JSON.stringify(validBody)));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Not signed in as admin." });
  });

  it("rejects malformed JSON", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(request("not-json"));
    expect(response.status).toBe(400);
  });

  it("rejects a missing or blank title", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(request(JSON.stringify({ ...validBody, title: "  " })));
    expect(response.status).toBe(400);
    expect(mocks.createBroadcastNotifications).not.toHaveBeenCalled();
  });

  it("rejects a missing or blank message", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(request(JSON.stringify({ ...validBody, message: "" })));
    expect(response.status).toBe(400);
    expect(mocks.createBroadcastNotifications).not.toHaveBeenCalled();
  });

  it("rejects recipients that are neither 'all' nor a non-empty array of emails", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(request(JSON.stringify({ ...validBody, recipients: [] })));
    expect(response.status).toBe(400);
    expect(mocks.createBroadcastNotifications).not.toHaveBeenCalled();
  });

  it("rejects an explicit recipient list containing a non-email string", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(request(JSON.stringify({ ...validBody, recipients: ["not-an-email"] })));
    expect(response.status).toBe(400);
    expect(mocks.createBroadcastNotifications).not.toHaveBeenCalled();
  });

  it("resolves 'all' to every user email via getAllUserEmails", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    await POST(request(JSON.stringify(validBody)));
    expect(mocks.getAllUserEmails).toHaveBeenCalled();
    expect(mocks.createBroadcastNotifications).toHaveBeenCalledWith(
      ["a@example.com", "b@example.com"],
      expect.objectContaining({ title: "Heads up", body: "Something changed." })
    );
  });

  it("sends only to an explicit recipient list when one is given, without calling getAllUserEmails", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    await POST(request(JSON.stringify({ ...validBody, recipients: ["one@example.com", "two@example.com"] })));
    expect(mocks.getAllUserEmails).not.toHaveBeenCalled();
    expect(mocks.createBroadcastNotifications).toHaveBeenCalledWith(
      ["one@example.com", "two@example.com"],
      expect.anything()
    );
  });

  it("returns 400 when 'all' resolves to no users at all", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.getAllUserEmails.mockResolvedValue([]);
    const response = await POST(request(JSON.stringify(validBody)));
    expect(response.status).toBe(400);
    expect(mocks.createBroadcastNotifications).not.toHaveBeenCalled();
  });

  // Open-redirect guard: an admin-supplied linkTo still goes through
  // getSafeRedirectPath (real, unmocked) before being handed to every
  // recipient - a scheme or protocol-relative value must be dropped.
  it("drops an unsafe linkTo (protocol-relative) rather than sending it to every recipient", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    await POST(request(JSON.stringify({ ...validBody, linkTo: "//evil.example.com" })));
    expect(mocks.createBroadcastNotifications).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ linkTo: undefined })
    );
  });

  it("drops a linkTo containing a scheme", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    await POST(request(JSON.stringify({ ...validBody, linkTo: "javascript:alert(1)" })));
    expect(mocks.createBroadcastNotifications).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ linkTo: undefined })
    );
  });

  it("passes through a safe, relative linkTo unchanged", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    await POST(request(JSON.stringify({ ...validBody, linkTo: "/tracker/bike" })));
    expect(mocks.createBroadcastNotifications).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ linkTo: "/tracker/bike" })
    );
  });

  it("returns ok:true with the recipient count on success", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(request(JSON.stringify(validBody)));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, sentCount: 2 });
  });
});
