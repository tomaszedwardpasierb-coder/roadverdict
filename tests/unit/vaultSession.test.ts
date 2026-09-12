// Place at: tests/unit/vaultSession.test.ts
import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { hashToken, encodeEmail } from "@/lib/auth/crypto";

const mocks = vi.hoisted(() => ({ upsert: vi.fn(), read: vi.fn(), deleteFn: vi.fn(), create: vi.fn() }));

const mockContainer = {
  item: vi.fn((_id?: string, _pk?: string) => ({ read: mocks.read, delete: mocks.deleteFn })),
  items: { upsert: mocks.upsert, create: mocks.create },
};

vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));
// generateToken/hashToken/encodeEmail/decodeEmail deliberately NOT
// mocked - real, deterministic crypto, same convention as twoFactor.test.ts.

import {
  createVaultSession,
  isVaultSessionValid,
  extendVaultSession,
  clearVaultSession,
  resolveVaultUnlock,
  VAULT_SESSION_COOKIE_NAME,
  VAULT_SESSION_MAX_AGE_SECONDS,
} from "@/lib/tracker/vaultSession";

const EMAIL = "rider@example.com";

function resetMocks() {
  Object.values(mocks).forEach((m) => m.mockReset());
  mockContainer.item.mockClear();
  mocks.upsert.mockResolvedValue(undefined);
  mocks.create.mockResolvedValue(undefined);
  mocks.deleteFn.mockResolvedValue(undefined);
}
resetMocks();

describe("createVaultSession", () => {
  it("creates a doc whose id is the hash of the raw token embedded in the returned cookie value", async () => {
    resetMocks();
    const { cookieValue, maxAge } = await createVaultSession(EMAIL);
    const [encodedEmail, raw] = cookieValue.split(".");
    expect(encodedEmail).toBe(encodeEmail(EMAIL));
    const doc = mocks.create.mock.calls[0][0];
    expect(doc.id).toBe(hashToken(raw));
    expect(doc.pk).toBe(EMAIL);
    expect(doc.type).toBe("vaultSession");
    expect(maxAge).toBe(10 * 60);
    expect(VAULT_SESSION_MAX_AGE_SECONDS).toBe(10 * 60);
  });
});

describe("isVaultSessionValid", () => {
  it("returns false when no doc exists", async () => {
    resetMocks();
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await isVaultSessionValid(EMAIL, "raw-token")).toBe(false);
  });

  it("returns false for an expired doc", async () => {
    resetMocks();
    mocks.read.mockResolvedValue({ resource: { type: "vaultSession", expiresAt: new Date(Date.now() - 1000).toISOString() } });
    expect(await isVaultSessionValid(EMAIL, "raw-token")).toBe(false);
  });

  it("returns false for a doc of the wrong type", async () => {
    resetMocks();
    mocks.read.mockResolvedValue({ resource: { type: "totpPendingLogin", expiresAt: new Date(Date.now() + 60_000).toISOString() } });
    expect(await isVaultSessionValid(EMAIL, "raw-token")).toBe(false);
  });

  it("returns true for a valid, unexpired doc", async () => {
    resetMocks();
    mocks.read.mockResolvedValue({ resource: { type: "vaultSession", expiresAt: new Date(Date.now() + 60_000).toISOString() } });
    expect(await isVaultSessionValid(EMAIL, "raw-token")).toBe(true);
  });

  it("fails soft to false if the read itself throws", async () => {
    resetMocks();
    mockContainer.item.mockReturnValueOnce({ read: vi.fn(async () => { throw new Error("cosmos unavailable"); }), delete: mocks.deleteFn });
    expect(await isVaultSessionValid(EMAIL, "raw-token")).toBe(false);
  });
});

describe("extendVaultSession", () => {
  it("pushes expiresAt forward on a valid session", async () => {
    resetMocks();
    const original = { id: "hash", pk: EMAIL, type: "vaultSession", expiresAt: new Date(Date.now() + 60_000).toISOString() };
    mocks.read.mockResolvedValue({ resource: original });
    const before = Date.now();

    await extendVaultSession(EMAIL, "raw-token");

    expect(mocks.upsert).toHaveBeenCalledOnce();
    const updated = mocks.upsert.mock.calls[0][0];
    expect(new Date(updated.expiresAt).getTime()).toBeGreaterThanOrEqual(before + 10 * 60 * 1000 - 1000);
  });

  it("does nothing when no session doc exists", async () => {
    resetMocks();
    mocks.read.mockResolvedValue({ resource: undefined });
    await extendVaultSession(EMAIL, "raw-token");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("fails soft when the read throws", async () => {
    resetMocks();
    mockContainer.item.mockReturnValueOnce({ read: vi.fn(async () => { throw new Error("down"); }), delete: mocks.deleteFn });
    await expect(extendVaultSession(EMAIL, "raw-token")).resolves.toBeUndefined();
  });
});

describe("clearVaultSession", () => {
  it("deletes the session doc", async () => {
    resetMocks();
    await clearVaultSession(EMAIL, "raw-token");
    expect(mocks.deleteFn).toHaveBeenCalledOnce();
    expect(mockContainer.item).toHaveBeenCalledWith(hashToken("raw-token"), EMAIL);
  });

  it("fails soft when the delete throws", async () => {
    resetMocks();
    mockContainer.item.mockReturnValueOnce({ read: mocks.read, delete: vi.fn(async () => { throw new Error("gone"); }) });
    await expect(clearVaultSession(EMAIL, "raw-token")).resolves.toBeUndefined();
  });
});

function fakeRequest(cookieValue: string | undefined): NextRequest {
  return { cookies: { get: () => (cookieValue !== undefined ? { value: cookieValue } : undefined) } } as unknown as NextRequest;
}

describe("resolveVaultUnlock", () => {
  it("returns null when there's no vault_session cookie", async () => {
    resetMocks();
    expect(await resolveVaultUnlock(fakeRequest(undefined), EMAIL)).toBeNull();
  });

  it("returns null when the cookie's email doesn't match the caller's own session email", async () => {
    resetMocks();
    const cookieValue = `${encodeEmail("someone-else@example.com")}.rawtoken`;
    expect(await resolveVaultUnlock(fakeRequest(cookieValue), EMAIL)).toBeNull();
  });

  it("returns null when the cookie names the right email but the session is invalid/expired", async () => {
    resetMocks();
    mocks.read.mockResolvedValue({ resource: undefined });
    const cookieValue = `${encodeEmail(EMAIL)}.rawtoken`;
    expect(await resolveVaultUnlock(fakeRequest(cookieValue), EMAIL)).toBeNull();
  });

  it("returns the raw token when the cookie is valid", async () => {
    resetMocks();
    mocks.read.mockResolvedValue({ resource: { type: "vaultSession", expiresAt: new Date(Date.now() + 60_000).toISOString() } });
    const cookieValue = `${encodeEmail(EMAIL)}.rawtoken`;
    expect(await resolveVaultUnlock(fakeRequest(cookieValue), EMAIL)).toBe("rawtoken");
  });

  it("does not throw on cookie name reference (sanity check for the constant)", () => {
    expect(VAULT_SESSION_COOKIE_NAME).toBe("vault_session");
  });
});
