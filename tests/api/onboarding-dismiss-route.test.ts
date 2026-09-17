import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  setOnboardingChecklistDismissed: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/userAccount", () => ({ setOnboardingChecklistDismissed: mocks.setOnboardingChecklistDismissed }));

import { POST } from "@/app/api/onboarding/dismiss/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/onboarding/dismiss", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/onboarding/dismiss", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
    mocks.setOnboardingChecklistDismissed.mockResolvedValue(undefined);
  });

  it("rejects an unauthenticated request", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify({ dismissed: true })));
    expect(response.status).toBe(401);
    expect(mocks.setOnboardingChecklistDismissed).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(request("not-json"));
    expect(response.status).toBe(400);
  });

  it("rejects a non-boolean dismissed value", async () => {
    const response = await POST(request(JSON.stringify({ dismissed: "yes" })));
    expect(response.status).toBe(400);
    expect(mocks.setOnboardingChecklistDismissed).not.toHaveBeenCalled();
  });

  it("dismisses the checklist for the signed-in user", async () => {
    const response = await POST(request(JSON.stringify({ dismissed: true })));
    expect(response.status).toBe(200);
    expect(mocks.setOnboardingChecklistDismissed).toHaveBeenCalledWith("rider@example.com", true);
  });

  it("un-dismisses (shows it again) when dismissed: false", async () => {
    const response = await POST(request(JSON.stringify({ dismissed: false })));
    expect(response.status).toBe(200);
    expect(mocks.setOnboardingChecklistDismissed).toHaveBeenCalledWith("rider@example.com", false);
  });
});
