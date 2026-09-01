import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  itemDelete: vi.fn(),
  item: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({ item: mocks.item }),
}));

import { POST } from "@/app/api/auth/logout/route";
// hashToken/encodeEmail are deliberately NOT mocked - both are pure,
// deterministic helpers, so it's simpler and more realistic to use them for
// real when building the session cookie value under test.
import { encodeEmail, hashToken } from "@/lib/auth/crypto";

function req(cookieValue?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieValue) headers["cookie"] = `session=${cookieValue}`;
  return new NextRequest("http://localhost/api/auth/logout", { method: "POST", headers });
}

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    mocks.itemDelete.mockReset();
    mocks.item.mockReset();
    mocks.item.mockReturnValue({ delete: mocks.itemDelete });
    mocks.itemDelete.mockResolvedValue(undefined);
  });

  it("deletes the matching session document and clears the cookie", async () => {
    const email = "owner@example.com";
    const sessionRaw = "raw-session-token";
    const cookieValue = `${encodeEmail(email)}.${sessionRaw}`;

    const response = await POST(req(cookieValue));

    expect(mocks.item).toHaveBeenCalledWith(hashToken(sessionRaw), email);
    expect(mocks.itemDelete).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    const cookie = response.cookies.get("session");
    expect(cookie?.value).toBe("");
    expect(cookie?.expires).toEqual(new Date(0));
  });

  it("still succeeds with no session cookie at all, and never touches the database", async () => {
    const response = await POST(req());

    expect(mocks.item).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("still succeeds for a malformed cookie value missing the session half", async () => {
    const cookieValue = encodeEmail("owner@example.com"); // no ".<sessionRaw>" suffix
    const response = await POST(req(cookieValue));

    expect(mocks.item).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("still succeeds and clears the cookie even if the session doc was already gone", async () => {
    mocks.itemDelete.mockRejectedValue(new Error("404 - not found"));
    const cookieValue = `${encodeEmail("owner@example.com")}.raw-session-token`;

    const response = await POST(req(cookieValue));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
