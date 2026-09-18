import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  sendFeedbackEmail: vi.fn(),
  createFeedback: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/resend", () => ({ sendFeedbackEmail: mocks.sendFeedbackEmail }));
vi.mock("@/lib/tracker/feedback", () => ({ createFeedback: mocks.createFeedback }));

import { POST } from "@/app/api/account/feedback/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/account/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const attachment = { blobName: "b1", fileName: "screenshot.png", fileType: "image/png", uploadedAt: "2026-01-01T00:00:00.000Z" };

describe("POST /api/account/feedback", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
    mocks.sendFeedbackEmail.mockResolvedValue(undefined);
    mocks.createFeedback.mockResolvedValue({ id: "f1" });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify({ type: "bug", message: "It broke" })));
    expect(response.status).toBe(401);
  });

  it("rejects an invalid type", async () => {
    const response = await POST(request(JSON.stringify({ type: "nonsense", message: "hi" })));
    expect(response.status).toBe(400);
    expect(mocks.createFeedback).not.toHaveBeenCalled();
  });

  it("rejects an empty message", async () => {
    const response = await POST(request(JSON.stringify({ type: "feature", message: "   " })));
    expect(response.status).toBe(400);
    expect(mocks.createFeedback).not.toHaveBeenCalled();
  });

  it("rejects a message over the length cap", async () => {
    const response = await POST(request(JSON.stringify({ type: "feature", message: "a".repeat(4001) })));
    expect(response.status).toBe(400);
  });

  it("saves a valid feedback message from the signed-in user's own email, and still emails a notification", async () => {
    const response = await POST(request(JSON.stringify({ type: "bug", message: "The mileage field is blank" })));
    expect(response.status).toBe(200);
    expect(mocks.createFeedback).toHaveBeenCalledWith("rider@example.com", "bug", "The mileage field is blank", undefined, "settings");
    expect(mocks.sendFeedbackEmail).toHaveBeenCalledWith("rider@example.com", "bug", "The mileage field is blank");
  });

  it("defaults source to 'settings' but honours 'assistant' when given", async () => {
    await POST(request(JSON.stringify({ type: "feature", message: "Add dark mode", source: "assistant" })));
    expect(mocks.createFeedback).toHaveBeenCalledWith("rider@example.com", "feature", "Add dark mode", undefined, "assistant");
  });

  // The durable Cosmos record is the source of truth now - a failure to
  // save it is a real error, unlike the email notification below.
  it("returns 500 when the feedback fails to save, without even attempting the email", async () => {
    mocks.createFeedback.mockRejectedValue(new Error("Cosmos unavailable"));
    const response = await POST(request(JSON.stringify({ type: "bug", message: "It broke" })));
    expect(response.status).toBe(500);
    expect(mocks.sendFeedbackEmail).not.toHaveBeenCalled();
  });

  // Flipped from the old email-only behaviour: the email is now a
  // best-effort courtesy on top of the saved record, so its failure must
  // never fail the whole request.
  it("still returns 200 when the notification email fails to send, since the feedback was already saved", async () => {
    mocks.sendFeedbackEmail.mockRejectedValue(new Error("Resend is down"));
    const response = await POST(request(JSON.stringify({ type: "other", message: "hi" })));
    expect(response.status).toBe(200);
    expect(mocks.createFeedback).toHaveBeenCalled();
  });

  describe("bug report attachments", () => {
    it("accepts up to 3 valid PNG/JPG attachments on a bug report", async () => {
      const response = await POST(request(JSON.stringify({ type: "bug", message: "Broken chart", attachments: [attachment, attachment, attachment] })));
      expect(response.status).toBe(200);
      expect(mocks.createFeedback).toHaveBeenCalledWith("rider@example.com", "bug", "Broken chart", [attachment, attachment, attachment], "settings");
    });

    it("rejects more than 3 attachments", async () => {
      const response = await POST(request(JSON.stringify({ type: "bug", message: "Broken chart", attachments: [attachment, attachment, attachment, attachment] })));
      expect(response.status).toBe(400);
      expect(mocks.createFeedback).not.toHaveBeenCalled();
    });

    it("rejects a malformed/invalid attachment (e.g. a disallowed fileType)", async () => {
      const badAttachment = { ...attachment, fileType: "application/pdf" };
      const response = await POST(request(JSON.stringify({ type: "bug", message: "Broken chart", attachments: [badAttachment] })));
      expect(response.status).toBe(400);
      expect(mocks.createFeedback).not.toHaveBeenCalled();
    });

    it("ignores attachments on a non-bug submission, even if some were sent", async () => {
      const response = await POST(request(JSON.stringify({ type: "feature", message: "Add dark mode", attachments: [attachment] })));
      expect(response.status).toBe(200);
      expect(mocks.createFeedback).toHaveBeenCalledWith("rider@example.com", "feature", "Add dark mode", undefined, "settings");
    });
  });
});
