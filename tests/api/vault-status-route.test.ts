// Place at: tests/api/vault-status-route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), resolveVaultUnlock: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/vaultSession", () => ({ resolveVaultUnlock: mocks.resolveVaultUnlock }));

import { GET } from "@/app/api/vault/status/route";

function req(): NextRequest {
  return new NextRequest("http://localhost/api/vault/status");
}

describe("GET /api/vault/status", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.resolveVaultUnlock.mockReset();
  });

  it("rejects when not signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(req());
    expect(response.status).toBe(401);
    expect(mocks.resolveVaultUnlock).not.toHaveBeenCalled();
  });

  it("reports unlocked: false when there's no valid vault session", async () => {
    mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
    mocks.resolveVaultUnlock.mockResolvedValue(null);
    const response = await GET(req());
    expect(await response.json()).toEqual({ unlocked: false });
  });

  it("reports unlocked: true when a valid vault session exists", async () => {
    mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
    mocks.resolveVaultUnlock.mockResolvedValue("raw-token");
    const response = await GET(req());
    expect(await response.json()).toEqual({ unlocked: true });
  });
});
