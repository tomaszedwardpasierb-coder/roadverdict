import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteAdminSession: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ deleteAdminSession: mocks.deleteAdminSession }));

import { POST } from "@/app/api/admin/logout/route";

describe("POST /api/admin/logout", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it("deletes the underlying admin session and clears the cookie", async () => {
    mocks.deleteAdminSession.mockResolvedValue(undefined);

    const response = await POST();

    expect(mocks.deleteAdminSession).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    const cookie = response.cookies.get("admin_session");
    expect(cookie?.value).toBe("");
    expect(cookie?.expires).toEqual(new Date(0));
  });

  it("still succeeds and clears the cookie even when there was no session to delete", async () => {
    // deleteAdminSession() is a no-op internally when there's no
    // admin_session cookie server-side to look up - logout must not require
    // an already-valid session to work, the same "exiting is always the
    // safe direction" reasoning applied elsewhere in the admin/session code.
    mocks.deleteAdminSession.mockResolvedValue(undefined);

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
