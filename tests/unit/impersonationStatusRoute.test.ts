import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAdminSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin/session", () => ({ getAdminSession: mockGetAdminSession }));

import { GET } from "../../src/app/api/admin/impersonation-status/route";

function request(cookie?: string): NextRequest {
  return new NextRequest("http://localhost/api/admin/impersonation-status", { headers: cookie ? { cookie } : {} });
}

describe("GET /api/admin/impersonation-status", () => {
  beforeEach(() => {
    mockGetAdminSession.mockReset();
  });

  it("returns no email, without an admin-session lookup, when there's no impersonation cookie", async () => {
    const res = await GET(request());

    expect(await res.json()).toEqual({ email: null });
    expect(mockGetAdminSession).not.toHaveBeenCalled();
  });

  it("returns the impersonated email only when a real admin session is ALSO valid", async () => {
    mockGetAdminSession.mockResolvedValue(true);
    const res = await GET(request("impersonating_as=user@example.com"));

    expect(await res.json()).toEqual({ email: "user@example.com" });
  });

  it("returns no email when the cookie exists but there's no valid admin session - the cookie alone is never sufficient", async () => {
    mockGetAdminSession.mockResolvedValue(false);
    const res = await GET(request("impersonating_as=user@example.com"));

    expect(await res.json()).toEqual({ email: null });
  });

  it("is never cacheable", async () => {
    const res = await GET(request());
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
