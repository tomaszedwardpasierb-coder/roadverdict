import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  upsert: vi.fn(),
  create: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    item: () => ({ read: mocks.read, patch: mocks.patch, delete: mocks.del }),
    items: {
      upsert: mocks.upsert,
      create: mocks.create,
      query: () => ({ fetchAll: mocks.query }),
    },
  }),
}));
// hashToken (auth/crypto) is real - the stored hash has to genuinely
// match what consumeAppLoginCode computes from the code typed in.

import {
  createAppLoginCode,
  consumeAppLoginCode,
  isAppCodeRequestCoolingDown,
  isAppCodeGuessingLocked,
  APP_CODE_TTL_SECONDS,
} from "@/lib/auth/appLoginCode";

const email = "rider@example.com";

// Captures the doc createAppLoginCode writes, and serves it back from read().
async function issueCode(overrides: Record<string, unknown> = {}): Promise<string> {
  const code = await createAppLoginCode(email);
  const stored = mocks.upsert.mock.calls.at(-1)![0];
  mocks.read.mockResolvedValue({ resource: { ...stored, _etag: "etag-1", ...overrides } });
  return code;
}

describe("appLoginCode", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.upsert.mockResolvedValue({});
    mocks.create.mockResolvedValue({});
    mocks.patch.mockResolvedValue({});
    mocks.del.mockResolvedValue({});
    mocks.query.mockResolvedValue({ resources: [] });
    mocks.read.mockResolvedValue({ resource: undefined });
  });

  it("issues a 6-digit code and stores only its hash, expiring in 10 minutes", async () => {
    const code = await createAppLoginCode(email);

    expect(code).toMatch(/^\d{6}$/);
    const stored = mocks.upsert.mock.calls[0][0];
    expect(stored).toMatchObject({ id: "app-login-code", pk: email, type: "appLoginCode", guesses: 0, ttl: APP_CODE_TTL_SECONDS });
    expect(JSON.stringify(stored)).not.toContain(code);
  });

  it("accepts the right code once, deleting it conditioned on the version read", async () => {
    const code = await issueCode();

    expect(await consumeAppLoginCode(email, code)).toBe("ok");
    expect(mocks.del).toHaveBeenCalledWith({ accessCondition: { type: "IfMatch", condition: "etag-1" } });
  });

  it("treats losing the race to use the same code as expired, not ok", async () => {
    const code = await issueCode();
    mocks.del.mockRejectedValue({ code: 412 });

    expect(await consumeAppLoginCode(email, code)).toBe("expired");
  });

  it("rejects a wrong code, counting the guess against the code and the account", async () => {
    const code = await issueCode();
    const wrong = code === "000000" ? "111111" : "000000";

    expect(await consumeAppLoginCode(email, wrong)).toBe("invalid");
    expect(mocks.patch).toHaveBeenCalledWith(
      expect.objectContaining({ operations: [{ op: "incr", path: "/guesses", value: 1 }] })
    );
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ pk: email, type: "appLoginCodeAttempt" }));
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it("refuses even the right code after five wrong guesses", async () => {
    const code = await issueCode({ guesses: 5 });
    expect(await consumeAppLoginCode(email, code)).toBe("expired");
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it("refuses an expired code", async () => {
    const code = await issueCode({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(await consumeAppLoginCode(email, code)).toBe("expired");
  });

  it("refuses when no code was ever requested", async () => {
    expect(await consumeAppLoginCode(email, "123456")).toBe("expired");
  });

  it("won't accept another account's code", async () => {
    const code = await issueCode();
    expect(await consumeAppLoginCode("someone-else@example.com", code)).toBe("invalid");
  });

  it("cools down new code requests for a minute after the last one", async () => {
    mocks.read.mockResolvedValue({ resource: { type: "appLoginCode", createdAt: new Date().toISOString() } });
    expect(await isAppCodeRequestCoolingDown(email)).toBe(true);

    mocks.read.mockResolvedValue({ resource: { type: "appLoginCode", createdAt: new Date(Date.now() - 61_000).toISOString() } });
    expect(await isAppCodeRequestCoolingDown(email)).toBe(false);

    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await isAppCodeRequestCoolingDown(email)).toBe(false);
  });

  it("locks guessing once an account reaches 20 wrong guesses in the window", async () => {
    mocks.query.mockResolvedValue({ resources: Array.from({ length: 19 }, (_, i) => ({ id: `a${i}` })) });
    expect(await isAppCodeGuessingLocked(email)).toBe(false);

    mocks.query.mockResolvedValue({ resources: Array.from({ length: 20 }, (_, i) => ({ id: `a${i}` })) });
    expect(await isAppCodeGuessingLocked(email)).toBe(true);
  });
});
