import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  sendFeedbackEmail: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/resend", () => ({ sendFeedbackEmail: mocks.sendFeedbackEmail }));

import { POST } from "@/app/api/account/feedback/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/account/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/account/feedback", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
    mocks.sendFeedbackEmail.mockResolvedValue(undefined);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify({ type: "bug", message: "It broke" })));
    expect(response.status).toBe(401);
  });

  it("rejects an invalid type", async () => {
    const response = await POST(request(JSON.stringify({ type: "nonsense", message: "hi" })));
    expect(response.status).toBe(400);
    expect(mocks.sendFeedbackEmail).not.toHaveBeenCalled();
  });

  it("rejects an empty message", async () => {
    const response = await POST(request(JSON.stringify({ type: "feature", message: "   " })));
    expect(response.status).toBe(400);
    expect(mocks.sendFeedbackEmail).not.toHaveBeenCalled();
  });

  it("rejects a message over the length cap", async () => {
    const response = await POST(request(JSON.stringify({ type: "feature", message: "a".repeat(4001) })));
    expect(response.status).toBe(400);
  });

  it("sends a valid feedback message from the signed-in user's own email", async () => {
    const response = await POST(request(JSON.stringify({ type: "bug", message: "The mileage field is blank" })));
    expect(response.status).toBe(200);
    expect(mocks.sendFeedbackEmail).toHaveBeenCalledWith("rider@example.com", "bug", "The mileage field is blank");
  });

  it("returns a 502 (not a 500 that looks like a server bug) when the email itself fails to send", async () => {
    mocks.sendFeedbackEmail.mockRejectedValue(new Error("Resend is down"));
    const response = await POST(request(JSON.stringify({ type: "other", message: "hi" })));
    expect(response.status).toBe(502);
  });
});
