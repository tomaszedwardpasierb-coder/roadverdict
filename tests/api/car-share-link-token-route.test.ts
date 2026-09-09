// Mirrors share-link-token-route.test.ts for the car equivalent route.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCarShareLink: vi.fn(),
  deleteCarShareLink: vi.fn(),
  logImpersonationActivityForCurrentRequest: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/carShareLink", () => ({ getCarShareLink: mocks.getCarShareLink, deleteCarShareLink: mocks.deleteCarShareLink }));
vi.mock("@/lib/admin/impersonation", () => ({
  logImpersonationActivityForCurrentRequest: mocks.logImpersonationActivityForCurrentRequest,
}));

import { DELETE } from "@/app/api/cars/car-share-link/[token]/route";

function req(): NextRequest {
  return new NextRequest("http://localhost/api/cars/car-share-link/tok", { method: "DELETE" });
}

describe("DELETE /api/cars/car-share-link/[token]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getCarShareLink.mockResolvedValue({ id: "tok-1", email: "owner@example.com" });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await DELETE(req(), { params: Promise.resolve({ token: "tok-1" }) });
    expect(response.status).toBe(401);
  });

  it("returns not found for a token that doesn't exist", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getCarShareLink.mockResolvedValue(null);
    const response = await DELETE(req(), { params: Promise.resolve({ token: "bad" }) });
    expect(response.status).toBe(404);
  });

  it("returns the identical not-found for a real link belonging to someone else, not a distinct 403", async () => {
    mocks.getSession.mockResolvedValue({ email: "attacker@example.com" });
    mocks.getCarShareLink.mockResolvedValue({ id: "tok-1", email: "owner@example.com" });

    const response = await DELETE(req(), { params: Promise.resolve({ token: "tok-1" }) });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Link not found." });
    expect(mocks.deleteCarShareLink).not.toHaveBeenCalled();
  });

  it("deletes a valid, owned link", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await DELETE(req(), { params: Promise.resolve({ token: "tok-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.deleteCarShareLink).toHaveBeenCalledWith("tok-1");
    expect(mocks.logImpersonationActivityForCurrentRequest).toHaveBeenCalledWith("carShareLink", "tok-1", "delete");
  });
});
