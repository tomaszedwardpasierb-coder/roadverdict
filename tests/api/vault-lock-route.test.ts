// Place at: tests/api/vault-lock-route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), resolveVaultUnlock: vi.fn(), clearVaultSession: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/vaultSession", () => ({
  resolveVaultUnlock: mocks.resolveVaultUnlock,
  clearVaultSession: mocks.clearVaultSession,
  VAULT_SESSION_COOKIE_NAME: "vault_session",
}));

import { POST } from "@/app/api/vault/lock/route";

function req(): NextRequest {
  return new NextRequest("http://localhost/api/vault/lock", { method: "POST" });
}

describe("POST /api/vault/lock", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
  });

  it("rejects when not signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(req());
    expect(response.status).toBe(401);
    expect(mocks.clearVaultSession).not.toHaveBeenCalled();
  });

  it("clears the session and cookie when a valid vault session exists", async () => {
    mocks.resolveVaultUnlock.mockResolvedValue("raw-token");
    const response = await POST(req());
    expect(response.status).toBe(200);
    expect(mocks.clearVaultSession).toHaveBeenCalledWith("rider@example.com", "raw-token");
    expect(response.cookies.get("vault_session")?.value).toBe("");
  });

  it("is a harmless no-op when already locked", async () => {
    mocks.resolveVaultUnlock.mockResolvedValue(null);
    const response = await POST(req());
    expect(response.status).toBe(200);
    expect(mocks.clearVaultSession).not.toHaveBeenCalled();
  });
});
