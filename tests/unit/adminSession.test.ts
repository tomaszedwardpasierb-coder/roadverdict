import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashToken } from "@/lib/auth/crypto";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  read: vi.fn(),
  deleteFn: vi.fn(),
  cookieGet: vi.fn(),
}));

const mockContainer = {
  item: vi.fn((_id?: string, _pk?: string) => ({ read: mocks.read, delete: mocks.deleteFn })),
  items: { upsert: mocks.upsert },
};

vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: mocks.cookieGet })) }));
// hashToken/generateToken are deliberately NOT mocked - they're pure,
// deterministic crypto wrappers (see reportAccess.test.ts for the same
// convention), and using the real implementation lets these tests verify
// the id actually written/looked-up matches the hash of the raw token.

import {
  verifyAdminPassword,
  createPendingTotp,
  consumePendingTotp,
  createAdminSession,
  getAdminSession,
  deleteAdminSession,
} from "@/lib/admin/session";

const ORIGINAL_HASH = process.env.ADMIN_PASSWORD_HASH;

function resetMocks() {
  Object.values(mocks).forEach((m) => m.mockReset());
  mockContainer.item.mockClear();
  mocks.upsert.mockResolvedValue(undefined);
  mocks.deleteFn.mockResolvedValue(undefined);
}

afterEach(() => {
  if (ORIGINAL_HASH === undefined) delete process.env.ADMIN_PASSWORD_HASH;
  else process.env.ADMIN_PASSWORD_HASH = ORIGINAL_HASH;
});

describe("verifyAdminPassword", () => {
  beforeEach(resetMocks);

  it("returns false when no ADMIN_PASSWORD_HASH is configured", () => {
    delete process.env.ADMIN_PASSWORD_HASH;
    expect(verifyAdminPassword("anything")).toBe(false);
  });

  it("returns true for the correct password against the configured hash", () => {
    process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync("correct-horse-battery-staple", 10);
    expect(verifyAdminPassword("correct-horse-battery-staple")).toBe(true);
  });

  it("returns false for an incorrect password", () => {
    process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync("correct-horse-battery-staple", 10);
    expect(verifyAdminPassword("wrong-password")).toBe(false);
  });
});

describe("createPendingTotp", () => {
  beforeEach(resetMocks);

  it("upserts a doc keyed by the hash of the returned raw token", async () => {
    const raw = await createPendingTotp();
    expect(mocks.upsert).toHaveBeenCalledOnce();
    const doc = mocks.upsert.mock.calls[0][0];
    expect(doc.id).toBe(hashToken(raw));
    expect(doc.pk).toBe("admin");
    expect(doc.type).toBe("adminPendingTotp");
  });

  it("sets expiresAt roughly 5 minutes in the future", async () => {
    const before = Date.now();
    await createPendingTotp();
    const doc = mocks.upsert.mock.calls[0][0];
    const expiresAt = new Date(doc.expiresAt).getTime();
    expect(expiresAt).toBeGreaterThan(before + 4 * 60 * 1000);
    expect(expiresAt).toBeLessThan(before + 6 * 60 * 1000);
  });
});

describe("consumePendingTotp", () => {
  beforeEach(resetMocks);

  it("returns false and does not delete when no doc exists at that hash", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await consumePendingTotp("raw-token")).toBe(false);
    expect(mocks.deleteFn).not.toHaveBeenCalled();
  });

  it("returns false when the stored doc isn't actually a pending-totp doc", async () => {
    mocks.read.mockResolvedValue({ resource: { type: "somethingElse", expiresAt: "2099-01-01T00:00:00.000Z" } });
    expect(await consumePendingTotp("raw-token")).toBe(false);
    expect(mocks.deleteFn).not.toHaveBeenCalled();
  });

  it("returns false and does not delete when the pending doc has expired", async () => {
    mocks.read.mockResolvedValue({ resource: { type: "adminPendingTotp", expiresAt: "2000-01-01T00:00:00.000Z" } });
    expect(await consumePendingTotp("raw-token")).toBe(false);
    expect(mocks.deleteFn).not.toHaveBeenCalled();
  });

  it("returns true and deletes the doc for a valid, unexpired pending token", async () => {
    mocks.read.mockResolvedValue({ resource: { type: "adminPendingTotp", expiresAt: "2099-01-01T00:00:00.000Z" } });
    expect(await consumePendingTotp("raw-token")).toBe(true);
    expect(mocks.deleteFn).toHaveBeenCalledOnce();
    expect(mockContainer.item).toHaveBeenCalledWith(hashToken("raw-token"), "admin");
  });

  it("fails soft to false if the read itself throws", async () => {
    mockContainer.item.mockReturnValueOnce({
      read: vi.fn(async () => {
        throw new Error("cosmos unavailable");
      }),
      delete: mocks.deleteFn,
    });
    expect(await consumePendingTotp("raw-token")).toBe(false);
  });
});

describe("createAdminSession", () => {
  beforeEach(resetMocks);

  it("upserts a session doc keyed by the hash of the returned raw token", async () => {
    const raw = await createAdminSession();
    const doc = mocks.upsert.mock.calls[0][0];
    expect(doc.id).toBe(hashToken(raw));
    expect(doc.pk).toBe("admin");
    expect(doc.type).toBe("adminSession");
  });

  it("sets expiresAt roughly 12 hours in the future", async () => {
    const before = Date.now();
    await createAdminSession();
    const doc = mocks.upsert.mock.calls[0][0];
    const expiresAt = new Date(doc.expiresAt).getTime();
    const twelveHours = 12 * 60 * 60 * 1000;
    expect(expiresAt).toBeGreaterThan(before + twelveHours - 60 * 1000);
    expect(expiresAt).toBeLessThan(before + twelveHours + 60 * 1000);
  });
});

describe("getAdminSession", () => {
  beforeEach(resetMocks);

  it("denies access when no admin_session cookie is present", async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    expect(await getAdminSession()).toBe(false);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("denies access when the cookie doesn't match any stored doc", async () => {
    mocks.cookieGet.mockReturnValue({ value: "raw-cookie-value" });
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await getAdminSession()).toBe(false);
  });

  it("denies access when the stored doc isn't actually an admin session", async () => {
    mocks.cookieGet.mockReturnValue({ value: "raw-cookie-value" });
    mocks.read.mockResolvedValue({ resource: { type: "adminPendingTotp", expiresAt: "2099-01-01T00:00:00.000Z" } });
    expect(await getAdminSession()).toBe(false);
  });

  it("denies access when the session has expired", async () => {
    mocks.cookieGet.mockReturnValue({ value: "raw-cookie-value" });
    mocks.read.mockResolvedValue({ resource: { type: "adminSession", expiresAt: "2000-01-01T00:00:00.000Z" } });
    expect(await getAdminSession()).toBe(false);
  });

  it("grants access for a valid, unexpired session and reads by hash of the cookie", async () => {
    mocks.cookieGet.mockReturnValue({ value: "raw-cookie-value" });
    mocks.read.mockResolvedValue({ resource: { type: "adminSession", expiresAt: "2099-01-01T00:00:00.000Z" } });
    expect(await getAdminSession()).toBe(true);
    expect(mockContainer.item).toHaveBeenCalledWith(hashToken("raw-cookie-value"), "admin");
  });

  it("fails soft to false if the read itself throws", async () => {
    mocks.cookieGet.mockReturnValue({ value: "raw-cookie-value" });
    mockContainer.item.mockReturnValueOnce({
      read: vi.fn(async () => {
        throw new Error("cosmos unavailable");
      }),
      delete: mocks.deleteFn,
    });
    expect(await getAdminSession()).toBe(false);
  });
});

describe("deleteAdminSession", () => {
  beforeEach(resetMocks);

  it("does nothing when there is no admin_session cookie", async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    await deleteAdminSession();
    expect(mockContainer.item).not.toHaveBeenCalled();
  });

  it("deletes the doc keyed by the hash of the cookie", async () => {
    mocks.cookieGet.mockReturnValue({ value: "raw-cookie-value" });
    await deleteAdminSession();
    expect(mockContainer.item).toHaveBeenCalledWith(hashToken("raw-cookie-value"), "admin");
    expect(mocks.deleteFn).toHaveBeenCalledOnce();
  });

  it("swallows a delete failure instead of throwing (already-gone doc is fine)", async () => {
    mocks.cookieGet.mockReturnValue({ value: "raw-cookie-value" });
    mockContainer.item.mockReturnValueOnce({
      read: mocks.read,
      delete: vi.fn(async () => {
        throw new Error("not found");
      }),
    });
    await expect(deleteAdminSession()).resolves.toBeUndefined();
  });
});
