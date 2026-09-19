import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  trackTabSwitchTiming: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/telemetry/rum", () => ({ trackTabSwitchTiming: mocks.trackTabSwitchTiming }));

import { POST } from "@/app/api/rum/tab-switch/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/rum/tab-switch", { method: "POST", body });
}

describe("POST /api/rum/tab-switch", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify({ tab: "bills", durationMs: 250, firstVisit: true })));
    expect(response.status).toBe(401);
    expect(mocks.trackTabSwitchTiming).not.toHaveBeenCalled();
  });

  it("rejects a malformed body", async () => {
    const response = await POST(request("not json"));
    expect(response.status).toBe(400);
    expect(mocks.trackTabSwitchTiming).not.toHaveBeenCalled();
  });

  it("rejects a payload missing required fields", async () => {
    const response = await POST(request(JSON.stringify({ tab: "bills" })));
    expect(response.status).toBe(400);
    expect(mocks.trackTabSwitchTiming).not.toHaveBeenCalled();
  });

  it("forwards a valid payload to telemetry", async () => {
    const response = await POST(request(JSON.stringify({ tab: "bills", durationMs: 842, firstVisit: true })));
    expect(response.status).toBe(200);
    expect(mocks.trackTabSwitchTiming).toHaveBeenCalledWith({ tab: "bills", durationMs: 842, firstVisit: true });
  });

  it("silently drops an implausible duration instead of forwarding it", async () => {
    const response = await POST(request(JSON.stringify({ tab: "bills", durationMs: 999_999, firstVisit: false })));
    expect(response.status).toBe(200);
    expect(mocks.trackTabSwitchTiming).not.toHaveBeenCalled();
  });

  it("silently drops a negative duration instead of forwarding it", async () => {
    const response = await POST(request(JSON.stringify({ tab: "bills", durationMs: -5, firstVisit: false })));
    expect(response.status).toBe(200);
    expect(mocks.trackTabSwitchTiming).not.toHaveBeenCalled();
  });
});
