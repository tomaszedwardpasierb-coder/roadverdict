import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ recordFunnelStep: vi.fn() }));

vi.mock("@/lib/analytics/funnel", async () => {
  const pure = await vi.importActual<typeof import("@/lib/analytics/funnelSource")>("@/lib/analytics/funnelSource");
  return { ...pure, recordFunnelStep: mocks.recordFunnelStep };
});

import { POST } from "@/app/api/funnel/route";

const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1";

function request(body: string, userAgent = SAFARI): NextRequest {
  return new NextRequest("http://localhost/api/funnel", { method: "POST", headers: { "user-agent": userAgent, "content-type": "text/plain" }, body });
}

beforeEach(() => {
  mocks.recordFunnelStep.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/funnel", () => {
  it("counts a home page visit with its source", async () => {
    const response = await POST(request(JSON.stringify({ step: "home", source: "youtube" })));
    expect(response.status).toBe(204);
    expect(mocks.recordFunnelStep).toHaveBeenCalledWith("home", { source: "youtube", inApp: false });
  });

  it("marks an in-app browser", async () => {
    await POST(request(JSON.stringify({ step: "login", source: "facebook" }), "Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/450.0]"));
    expect(mocks.recordFunnelStep).toHaveBeenCalledWith("login", { source: "facebook", inApp: true });
  });

  it("only takes the two page steps - the later ones are counted on the server", async () => {
    await POST(request(JSON.stringify({ step: "account_created" })));
    await POST(request(JSON.stringify({ step: "first_vehicle" })));
    expect(mocks.recordFunnelStep).not.toHaveBeenCalled();
  });

  it("files an unknown source under other, and ignores bots and junk", async () => {
    await POST(request(JSON.stringify({ step: "home", source: "<x>" })));
    expect(mocks.recordFunnelStep).toHaveBeenCalledWith("home", { source: "other", inApp: false });
    mocks.recordFunnelStep.mockClear();
    await POST(request(JSON.stringify({ step: "home" }), "Googlebot/2.1"));
    await POST(request("not json"));
    expect(mocks.recordFunnelStep).not.toHaveBeenCalled();
  });
});
