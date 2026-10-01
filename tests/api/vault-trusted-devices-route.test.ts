import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ checkVaultGate: vi.fn(), createTrustedDevice: vi.fn() }));

vi.mock("@/lib/tracker/vaultAccess", () => ({ checkVaultGate: mocks.checkVaultGate }));
vi.mock("@/lib/auth/trustedDevice", () => ({ createTrustedDevice: mocks.createTrustedDevice, MAX_TRUSTED_DEVICES: 5 }));

import { POST } from "@/app/api/vault/trusted-devices/route";

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/vault/trusted-devices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.checkVaultGate.mockResolvedValue({ ok: true, email: "rider@example.com", raw: "r" });
});

describe("POST /api/vault/trusted-devices", () => {
  it("only trusts a phone while the Vault is open, just unlocked with a real code", async () => {
    mocks.checkVaultGate.mockResolvedValue({ ok: false, status: 401, error: "vault_locked" });
    const res = await POST(req({ name: "Pixel 7" }));
    expect(res.status).toBe(401);
    expect(mocks.createTrustedDevice).not.toHaveBeenCalled();
  });

  it("hands the phone its id and secret, once", async () => {
    mocks.createTrustedDevice.mockResolvedValue({ ok: true, device: { id: "dev-1", name: "Pixel 7", createdAt: "x", lastUsedAt: null }, secret: "s3cret" });
    const res = await POST(req({ name: "Pixel 7" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ deviceId: "dev-1", secret: "s3cret" });
    expect(mocks.createTrustedDevice).toHaveBeenCalledWith("rider@example.com", "Pixel 7");
  });

  it("says so at the limit", async () => {
    mocks.createTrustedDevice.mockResolvedValue({ ok: false, reason: "limit_reached" });
    const res = await POST(req({ name: "Pixel 7" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("5 phones");
  });
});
