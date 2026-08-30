import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getShareLink: vi.fn(),
  deleteShareLink: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/shareLink", () => ({ getShareLink: mocks.getShareLink, deleteShareLink: mocks.deleteShareLink }));

import { DELETE } from "@/app/api/tracker/share-link/[token]/route";

function req(): NextRequest {
  return new NextRequest("http://localhost/api/tracker/share-link/tok", { method: "DELETE" });
}

describe("DELETE /api/tracker/share-link/[token]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getShareLink.mockResolvedValue({ id: "tok-1", email: "owner@example.com" });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await DELETE(req(), { params: { token: "tok-1" } });
    expect(response.status).toBe(401);
  });

  it("returns not found for a token that doesn't exist", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getShareLink.mockResolvedValue(null);
    const response = await DELETE(req(), { params: { token: "bad" } });
    expect(response.status).toBe(404);
  });

  // Same collapse pattern seen elsewhere in this app: "doesn't exist"
  // and "exists but belongs to someone else" return the identical 404,
  // so a token alone can never be used to probe whether a real link
  // exists for another account.
  it("returns the identical not-found for a real link belonging to someone else, not a distinct 403", async () => {
    mocks.getSession.mockResolvedValue({ email: "attacker@example.com" });
    mocks.getShareLink.mockResolvedValue({ id: "tok-1", email: "owner@example.com" });

    const response = await DELETE(req(), { params: { token: "tok-1" } });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Link not found." });
    expect(mocks.deleteShareLink).not.toHaveBeenCalled();
  });

  it("deletes a valid, owned link", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await DELETE(req(), { params: { token: "tok-1" } });
    expect(response.status).toBe(200);
    expect(mocks.deleteShareLink).toHaveBeenCalledWith("tok-1");
  });
});