// Place at: tests/unit/vaultAccess.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), isPro: vi.fn(), isTwoFactorEnabled: vi.fn(), resolveVaultUnlock: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/subscriptions", () => ({ isPro: mocks.isPro }));
vi.mock("@/lib/auth/twoFactor", () => ({ isTwoFactorEnabled: mocks.isTwoFactorEnabled }));
vi.mock("@/lib/tracker/vaultSession", () => ({ resolveVaultUnlock: mocks.resolveVaultUnlock }));

import { checkVaultGate } from "@/lib/tracker/vaultAccess";

const EMAIL = "rider@example.com";

function req(): NextRequest {
  return new NextRequest("http://localhost/api/vault/documents");
}

describe("checkVaultGate", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getSession.mockResolvedValue({ email: EMAIL });
    mocks.isPro.mockResolvedValue(true);
    mocks.isTwoFactorEnabled.mockResolvedValue(true);
    mocks.resolveVaultUnlock.mockResolvedValue("raw-token");
  });

  it("fails with 401 when not signed in, before checking anything else", async () => {
    mocks.getSession.mockResolvedValue(null);
    const result = await checkVaultGate(req());
    expect(result).toEqual({ ok: false, status: 401, error: "Not signed in." });
    expect(mocks.isPro).not.toHaveBeenCalled();
  });

  it("fails with 403 for a non-Pro account, before checking 2FA or vault-unlock", async () => {
    mocks.isPro.mockResolvedValue(false);
    const result = await checkVaultGate(req());
    expect(result).toEqual({ ok: false, status: 403, error: "The Vault is a Premium feature." });
    expect(mocks.isTwoFactorEnabled).not.toHaveBeenCalled();
  });

  it("fails with 403 when 2FA isn't enabled, before checking vault-unlock", async () => {
    mocks.isTwoFactorEnabled.mockResolvedValue(false);
    const result = await checkVaultGate(req());
    expect(result).toEqual({ ok: false, status: 403, error: "Enable two-factor authentication in Settings to use the Vault." });
    expect(mocks.resolveVaultUnlock).not.toHaveBeenCalled();
  });

  it("fails with 401 vault_locked when there's no valid vault session", async () => {
    mocks.resolveVaultUnlock.mockResolvedValue(null);
    const result = await checkVaultGate(req());
    expect(result).toEqual({ ok: false, status: 401, error: "vault_locked" });
  });

  it("succeeds with the email and raw vault token when every check passes", async () => {
    const result = await checkVaultGate(req());
    expect(result).toEqual({ ok: true, email: EMAIL, raw: "raw-token" });
  });
});
