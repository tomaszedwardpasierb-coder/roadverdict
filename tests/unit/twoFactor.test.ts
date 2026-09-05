// Place at: tests/unit/twoFactor.test.ts
import { randomBytes } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOTP, Secret } from "otpauth";
import { hashToken, encryptSecret, decryptSecret } from "@/lib/auth/crypto";
import { hashBackupCode } from "@/lib/auth/totp";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  read: vi.fn(),
  deleteFn: vi.fn(),
  create: vi.fn(),
  query: vi.fn(),
}));

const mockContainer = {
  item: vi.fn((_id?: string, _pk?: string) => ({ read: mocks.read, delete: mocks.deleteFn })),
  items: { upsert: mocks.upsert, create: mocks.create, query: mocks.query },
};

vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));
// hashToken/generateToken/encryptSecret/decryptSecret and every function
// in totp.ts are deliberately NOT mocked - real, deterministic crypto,
// same convention as adminSession.test.ts.

import {
  isTwoFactorEnabled,
  startEnrollment,
  confirmEnrollment,
  disableTwoFactor,
  createPendingLogin,
  consumePendingLogin,
  verifyLoginCode,
  checkTotpRateLimit,
  recordTotpAttempt,
} from "@/lib/auth/twoFactor";

const EMAIL = "rider@example.com";
const ORIGINAL_KEY = process.env.TOTP_ENCRYPTION_KEY;

function codeFor(secretBase32: string, timestamp = Date.now()): string {
  const totp = new TOTP({ secret: Secret.fromBase32(secretBase32), digits: 6, period: 30 });
  return totp.generate({ timestamp });
}

function resetMocks() {
  Object.values(mocks).forEach((m) => m.mockReset());
  mockContainer.item.mockClear();
  mocks.upsert.mockResolvedValue(undefined);
  mocks.create.mockResolvedValue(undefined);
  mocks.deleteFn.mockResolvedValue(undefined);
  mocks.query.mockReturnValue({ fetchAll: vi.fn().mockResolvedValue({ resources: [] }) });
}

beforeEach(() => {
  process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  resetMocks();
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
  else process.env.TOTP_ENCRYPTION_KEY = ORIGINAL_KEY;
});

describe("isTwoFactorEnabled", () => {
  it("returns false when the account has no user doc at all", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await isTwoFactorEnabled(EMAIL)).toBe(false);
  });

  it("returns false when the user doc has no totp field", async () => {
    mocks.read.mockResolvedValue({ resource: { type: "user", email: EMAIL } });
    expect(await isTwoFactorEnabled(EMAIL)).toBe(false);
  });

  it("returns false when totp exists but enabled is false (e.g. mid-enrollment)", async () => {
    mocks.read.mockResolvedValue({ resource: { type: "user", email: EMAIL, totp: { enabled: false } } });
    expect(await isTwoFactorEnabled(EMAIL)).toBe(false);
  });

  it("returns true when totp.enabled is true", async () => {
    mocks.read.mockResolvedValue({ resource: { type: "user", email: EMAIL, totp: { enabled: true } } });
    expect(await isTwoFactorEnabled(EMAIL)).toBe(true);
  });
});

describe("startEnrollment", () => {
  it("upserts a pending-enrollment doc keyed by a fixed id under the account's own partition, never touching the real user doc", async () => {
    const { secret, otpauthUri } = await startEnrollment(EMAIL);
    expect(mocks.upsert).toHaveBeenCalledOnce();
    const doc = mocks.upsert.mock.calls[0][0];
    expect(doc.id).toBe("totp-enrollment-pending");
    expect(doc.pk).toBe(EMAIL);
    expect(doc.type).toBe("totpEnrollmentPending");
    expect(decryptSecret(doc.secretEncrypted)).toBe(secret);
    expect(otpauthUri).toContain(encodeURIComponent(EMAIL));
  });

  it("sets a Cosmos ttl matching the 15-minute expiry", async () => {
    await startEnrollment(EMAIL);
    const doc = mocks.upsert.mock.calls[0][0];
    expect(doc.ttl).toBe(15 * 60);
  });

  it("never marks 2FA as enabled by itself - only confirmEnrollment does that", async () => {
    await startEnrollment(EMAIL);
    // The only Cosmos write here is the pending doc above; nothing
    // resembling the real user doc (no `totp.enabled`) is written.
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
});

describe("confirmEnrollment", () => {
  function pendingDoc(secret: string, overrides: Record<string, unknown> = {}) {
    return {
      type: "totpEnrollmentPending",
      secretEncrypted: encryptSecret(secret),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      ...overrides,
    };
  }

  it("rejects when there's no pending enrollment to confirm", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    const result = await confirmEnrollment(EMAIL, "123456");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("expired") });
  });

  it("rejects when the pending enrollment has expired", async () => {
    mocks.read.mockResolvedValue({ resource: pendingDoc("JBSWY3DPEHPK3PXP", { expiresAt: new Date(Date.now() - 1000).toISOString() }) });
    const result = await confirmEnrollment(EMAIL, "123456");
    expect(result.ok).toBe(false);
  });

  it("rejects an incorrect code without turning 2FA on", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    mocks.read.mockResolvedValueOnce({ resource: pendingDoc(secret) });
    const wrong = codeFor(secret) === "000000" ? "111111" : "000000";
    const result = await confirmEnrollment(EMAIL, wrong);
    expect(result).toEqual({ ok: false, error: "Incorrect code." });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("turns 2FA on, stores the encrypted secret and hashed backup codes on the user doc, and deletes the pending doc, given a correct code", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    mocks.read
      .mockResolvedValueOnce({ resource: pendingDoc(secret) }) // enrollment pending doc read
      .mockResolvedValueOnce({ resource: { id: EMAIL, pk: EMAIL, type: "user", email: EMAIL } }); // getUserDoc

    const result = await confirmEnrollment(EMAIL, codeFor(secret));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.backupCodes).toHaveLength(8);

    const savedUser = mocks.upsert.mock.calls[0][0];
    expect(savedUser.totp.enabled).toBe(true);
    expect(decryptSecret(savedUser.totp.secretEncrypted)).toBe(secret);
    expect(savedUser.totp.backupCodeHashes).toEqual(result.backupCodes.map(hashBackupCode));

    expect(mocks.deleteFn).toHaveBeenCalledOnce();
  });

  it("returns an error rather than throwing if the user doc has vanished between enrollment and confirmation", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    mocks.read
      .mockResolvedValueOnce({ resource: pendingDoc(secret) })
      .mockResolvedValueOnce({ resource: undefined });
    const result = await confirmEnrollment(EMAIL, codeFor(secret));
    expect(result).toEqual({ ok: false, error: "No account found." });
  });
});

describe("disableTwoFactor", () => {
  it("rejects when 2FA isn't enabled on this account", async () => {
    mocks.read.mockResolvedValue({ resource: { type: "user", email: EMAIL } });
    const result = await disableTwoFactor(EMAIL, "123456");
    expect(result).toEqual({ ok: false, error: "Two-factor authentication isn't turned on." });
  });

  it("rejects an incorrect code, leaving 2FA on", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const user = { type: "user", email: EMAIL, totp: { enabled: true, secretEncrypted: encryptSecret(secret), backupCodeHashes: [] } };
    mocks.read.mockResolvedValue({ resource: user });
    const wrong = codeFor(secret) === "000000" ? "111111" : "000000";
    const result = await disableTwoFactor(EMAIL, wrong);
    expect(result).toEqual({ ok: false, error: "Incorrect code." });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("turns 2FA off given the correct live code", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const user = { type: "user", email: EMAIL, totp: { enabled: true, secretEncrypted: encryptSecret(secret), backupCodeHashes: [] } };
    mocks.read.mockResolvedValue({ resource: user });
    const result = await disableTwoFactor(EMAIL, codeFor(secret));
    expect(result).toEqual({ ok: true });
    const savedUser = mocks.upsert.mock.calls[0][0];
    expect(savedUser.totp).toBeUndefined();
  });

  it("also accepts a valid backup code, since a lost phone must still let someone turn 2FA off cleanly", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const user = { type: "user", email: EMAIL, totp: { enabled: true, secretEncrypted: encryptSecret(secret), backupCodeHashes: [hashBackupCode("abcd1234ef")] } };
    mocks.read.mockResolvedValue({ resource: user });
    const result = await disableTwoFactor(EMAIL, "abcd1234ef");
    expect(result).toEqual({ ok: true });
  });
});

describe("createPendingLogin / consumePendingLogin", () => {
  it("creates a doc whose id is the hash of the raw token embedded in the returned cookie value", async () => {
    const { cookieValue, maxAge } = await createPendingLogin(EMAIL);
    const [, raw] = cookieValue.split(".");
    const doc = mocks.create.mock.calls[0][0];
    expect(doc.id).toBe(hashToken(raw));
    expect(doc.pk).toBe(EMAIL);
    expect(doc.type).toBe("totpPendingLogin");
    expect(maxAge).toBe(5 * 60);
  });

  it("consumePendingLogin returns false and does not delete when no doc exists", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await consumePendingLogin(EMAIL, "raw-token")).toBe(false);
    expect(mocks.deleteFn).not.toHaveBeenCalled();
  });

  it("consumePendingLogin returns false for an expired doc", async () => {
    mocks.read.mockResolvedValue({ resource: { type: "totpPendingLogin", expiresAt: new Date(Date.now() - 1000).toISOString() } });
    expect(await consumePendingLogin(EMAIL, "raw-token")).toBe(false);
  });

  it("consumePendingLogin returns true and deletes a valid, unexpired doc", async () => {
    mocks.read.mockResolvedValue({ resource: { type: "totpPendingLogin", expiresAt: new Date(Date.now() + 60_000).toISOString() } });
    expect(await consumePendingLogin(EMAIL, "raw-token")).toBe(true);
    expect(mocks.deleteFn).toHaveBeenCalledOnce();
    expect(mockContainer.item).toHaveBeenCalledWith(hashToken("raw-token"), EMAIL);
  });
});

describe("verifyLoginCode", () => {
  it("returns false when 2FA isn't enabled on the account", async () => {
    mocks.read.mockResolvedValue({ resource: { type: "user", email: EMAIL } });
    expect(await verifyLoginCode(EMAIL, "123456")).toBe(false);
  });

  it("accepts a correct live code", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    mocks.read.mockResolvedValue({ resource: { type: "user", email: EMAIL, totp: { enabled: true, secretEncrypted: encryptSecret(secret), backupCodeHashes: [] } } });
    expect(await verifyLoginCode(EMAIL, codeFor(secret))).toBe(true);
  });

  it("accepts a valid backup code and burns it (removes it from the stored list) so it can't be reused", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const user = { type: "user", email: EMAIL, totp: { enabled: true, secretEncrypted: encryptSecret(secret), backupCodeHashes: [hashBackupCode("abcd1234ef"), hashBackupCode("ffffffffff")] } };
    mocks.read.mockResolvedValue({ resource: user });

    expect(await verifyLoginCode(EMAIL, "abcd1234ef")).toBe(true);

    const savedUser = mocks.upsert.mock.calls[0][0];
    expect(savedUser.totp.backupCodeHashes).toEqual([hashBackupCode("ffffffffff")]);
  });

  it("rejects a backup code that was already used (no longer in the stored list)", async () => {
    const user = { type: "user", email: EMAIL, totp: { enabled: true, secretEncrypted: encryptSecret("JBSWY3DPEHPK3PXP"), backupCodeHashes: [] } };
    mocks.read.mockResolvedValue({ resource: user });
    expect(await verifyLoginCode(EMAIL, "abcd1234ef")).toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("checkTotpRateLimit / recordTotpAttempt", () => {
  it("allows the attempt when fewer than the max have been recorded in the window", async () => {
    mocks.query.mockReturnValue({ fetchAll: vi.fn().mockResolvedValue({ resources: Array(9).fill({ id: "x" }) }) });
    expect(await checkTotpRateLimit(EMAIL, "login")).toBe(true);
  });

  it("blocks once the max has been reached", async () => {
    mocks.query.mockReturnValue({ fetchAll: vi.fn().mockResolvedValue({ resources: Array(10).fill({ id: "x" }) }) });
    expect(await checkTotpRateLimit(EMAIL, "login")).toBe(false);
  });

  it("scopes the query to this account's own partition and this attempt kind's id prefix", async () => {
    const fetchAll = vi.fn().mockResolvedValue({ resources: [] });
    mocks.query.mockReturnValue({ fetchAll });
    await checkTotpRateLimit(EMAIL, "disable");
    const [queryArg, optionsArg] = mocks.query.mock.calls[0];
    expect(optionsArg).toEqual({ partitionKey: EMAIL });
    expect(queryArg.parameters[0].value).toBe("totp-attempt:disable:");
  });

  it("recordTotpAttempt creates a doc under this account's partition with the matching kind prefix", async () => {
    await recordTotpAttempt(EMAIL, "enroll");
    const doc = mocks.create.mock.calls[0][0];
    expect(doc.pk).toBe(EMAIL);
    expect(doc.type).toBe("totpAttempt");
    expect(doc.id.startsWith("totp-attempt:enroll:")).toBe(true);
  });
});
