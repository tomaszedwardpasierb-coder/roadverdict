import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  isPro: vi.fn(),
  isTwoFactorEnabled: vi.fn(),
  checkTotpRateLimit: vi.fn(),
  recordTotpAttempt: vi.fn(),
  verifyTrustedDevice: vi.fn(),
  createVaultSession: vi.fn(),
  recordVaultAccess: vi.fn(),
  lookupCountry: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/subscriptions", () => ({ isPro: mocks.isPro }));
vi.mock("@/lib/auth/twoFactor", () => ({
  isTwoFactorEnabled: mocks.isTwoFactorEnabled,
  checkTotpRateLimit: mocks.checkTotpRateLimit,
  recordTotpAttempt: mocks.recordTotpAttempt,
}));
vi.mock("@/lib/auth/trustedDevice", () => ({ verifyTrustedDevice: mocks.verifyTrustedDevice }));
vi.mock("@/lib/tracker/vaultSession", () => ({ createVaultSession: mocks.createVaultSession }));
vi.mock("@/lib/tracker/vaultAudit", () => ({ lookupCountry: mocks.lookupCountry, recordVaultAccess: mocks.recordVaultAccess }));

import { POST } from "@/app/api/vault/device-unlock/route";

const EMAIL = "rider@example.com";
const req = (body: unknown) =>
  new NextRequest("http://localhost/api/vault/device-unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email: EMAIL });
  mocks.isPro.mockResolvedValue(true);
  mocks.isTwoFactorEnabled.mockResolvedValue(true);
  mocks.checkTotpRateLimit.mockResolvedValue(true);
  mocks.verifyTrustedDevice.mockResolvedValue(true);
  mocks.createVaultSession.mockResolvedValue({ cookieValue: "vault-token", maxAge: 600 });
  mocks.recordVaultAccess.mockResolvedValue(null);
  mocks.lookupCountry.mockResolvedValue(null);
});

describe("POST /api/vault/device-unlock", () => {
  it("opens the Vault for the owner's trusted phone, recorded as fingerprint or PIN", async () => {
    const res = await POST(req({ deviceId: "dev-1", secret: "s3cret" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ vaultToken: "vault-token", expiresInSeconds: 600 });
    expect(mocks.verifyTrustedDevice).toHaveBeenCalledWith(EMAIL, "dev-1", "s3cret");
    expect(mocks.recordVaultAccess).toHaveBeenCalledWith(EMAIL, expect.objectContaining({ browser: "RoadVerdict Android app (fingerprint or PIN)" }));
  });

  it("refuses an untrusted phone, counts the attempt, and says why", async () => {
    mocks.verifyTrustedDevice.mockResolvedValue(false);
    const res = await POST(req({ deviceId: "dev-1", secret: "wrong" }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("device_not_trusted");
    expect(mocks.recordTotpAttempt).toHaveBeenCalledWith(EMAIL, "vault");
    expect(mocks.createVaultSession).not.toHaveBeenCalled();
  });

  it("refuses a malformed request without opening anything", async () => {
    const res = await POST(req({ deviceId: 42 }));
    expect(res.status).toBe(401);
    expect(mocks.verifyTrustedDevice).not.toHaveBeenCalled();
    expect(mocks.createVaultSession).not.toHaveBeenCalled();
  });

  it("keeps every other Vault check: signed in, Pro, two-factor on, attempt limit", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(req({ deviceId: "d", secret: "s" }))).status).toBe(401);
    mocks.isPro.mockResolvedValueOnce(false);
    expect((await POST(req({ deviceId: "d", secret: "s" }))).status).toBe(403);
    mocks.isTwoFactorEnabled.mockResolvedValueOnce(false);
    expect((await POST(req({ deviceId: "d", secret: "s" }))).status).toBe(403);
    mocks.checkTotpRateLimit.mockResolvedValueOnce(false);
    expect((await POST(req({ deviceId: "d", secret: "s" }))).status).toBe(429);
    expect(mocks.createVaultSession).not.toHaveBeenCalled();
  });
});
