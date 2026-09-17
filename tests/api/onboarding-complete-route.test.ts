import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  markOnboardingStepComplete: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/userAccount", () => ({ markOnboardingStepComplete: mocks.markOnboardingStepComplete }));

import { POST } from "@/app/api/onboarding/complete/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/onboarding/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/onboarding/complete", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
    mocks.markOnboardingStepComplete.mockResolvedValue(undefined);
  });

  it("rejects an unauthenticated request", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify({ step: "viewed-report" })));
    expect(response.status).toBe(401);
    expect(mocks.markOnboardingStepComplete).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(request("not-json"));
    expect(response.status).toBe(400);
  });

  // Only "viewed-report" and "explored-transfer" have no natural
  // server-side success path of their own to mark themselves complete
  // from - every other step (including a made-up one) must be rejected
  // here, since a signed-in client could otherwise mark any step
  // "complete" - including logged-first-entry - without the real action
  // behind it ever having happened.
  it.each(["logged-first-entry", "used-ai-assistant", "compared-vehicles", "created-share-link", "not-a-real-step", ""])(
    "rejects step '%s', which has no client-triggerable path",
    async (step) => {
      const response = await POST(request(JSON.stringify({ step })));
      expect(response.status).toBe(400);
      expect(mocks.markOnboardingStepComplete).not.toHaveBeenCalled();
    }
  );

  it.each(["viewed-report", "explored-transfer"])("marks '%s' complete for the signed-in user", async (step) => {
    const response = await POST(request(JSON.stringify({ step })));
    expect(response.status).toBe(200);
    expect(mocks.markOnboardingStepComplete).toHaveBeenCalledWith("rider@example.com", step);
  });
});
