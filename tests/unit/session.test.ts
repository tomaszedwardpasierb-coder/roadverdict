import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  itemsCreate: vi.fn(),
  cookieGet: vi.fn(),
}));

const mockContainer = {
  item: vi.fn((_id?: string, _pk?: string) => ({ read: mocks.read })),
  items: {
    create: mocks.itemsCreate,
  },
};

vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: mocks.cookieGet })) }));
// @/lib/auth/crypto (hashToken/generateToken/encodeEmail/decodeEmail) is
// deliberately NOT mocked - it's pure, real SHA-256/randomBytes/base64url,
// so these tests verify the genuine cookie-encodes-to-what-getSession-
// decodes relationship, not a stand-in for it.

import { getSession, createSessionForEmail, SESSION_TTL_SECONDS } from "@/lib/auth/session";
import { hashToken, decodeEmail, encodeEmail } from "@/lib/auth/crypto";

function resetAllMocks() {
  mocks.read.mockReset();
  mocks.itemsCreate.mockReset();
  mocks.cookieGet.mockReset();
  mockContainer.item.mockClear();
}

// ---------------------------------------------------------------------
// getSession
// ---------------------------------------------------------------------

describe("getSession", () => {
  beforeEach(resetAllMocks);

  it("returns null when there is no session cookie at all", async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    expect(await getSession()).toBeNull();
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("returns null when the cookie value has no '.' separator at all", async () => {
    mocks.cookieGet.mockReturnValue({ value: "nodothere" });
    expect(await getSession()).toBeNull();
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("returns null when the part after the '.' is missing (nothing after a trailing dot)", async () => {
    mocks.cookieGet.mockReturnValue({ value: `${encodeEmail("user@example.com")}.` });
    expect(await getSession()).toBeNull();
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("returns null when the part before the '.' is missing (cookie starts with a dot)", async () => {
    mocks.cookieGet.mockReturnValue({ value: ".rawsessiontoken" });
    expect(await getSession()).toBeNull();
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("looks up the item by the real SHA-256 hash of the raw session token, partitioned by the decoded email", async () => {
    const email = "user@example.com";
    mocks.cookieGet.mockReturnValue({ value: `${encodeEmail(email)}.raw-session-value` });
    mocks.read.mockResolvedValue({ resource: undefined });

    await getSession();

    expect(mockContainer.item).toHaveBeenCalledWith(hashToken("raw-session-value"), email);
  });

  it("returns null when no matching document is found", async () => {
    mocks.cookieGet.mockReturnValue({ value: `${encodeEmail("user@example.com")}.raw-session-value` });
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await getSession()).toBeNull();
  });

  it("returns null when the stored document isn't actually a session (wrong type)", async () => {
    mocks.cookieGet.mockReturnValue({ value: `${encodeEmail("user@example.com")}.raw-session-value` });
    mocks.read.mockResolvedValue({ resource: { type: "user", expiresAt: "2099-01-01T00:00:00.000Z" } });
    expect(await getSession()).toBeNull();
  });

  it("returns null when the session has already expired", async () => {
    mocks.cookieGet.mockReturnValue({ value: `${encodeEmail("user@example.com")}.raw-session-value` });
    mocks.read.mockResolvedValue({ resource: { type: "session", expiresAt: "2000-01-01T00:00:00.000Z" } });
    expect(await getSession()).toBeNull();
  });

  it("returns the decoded email for a valid, unexpired session", async () => {
    mocks.cookieGet.mockReturnValue({ value: `${encodeEmail("user@example.com")}.raw-session-value` });
    mocks.read.mockResolvedValue({ resource: { type: "session", expiresAt: "2099-01-01T00:00:00.000Z" } });
    expect(await getSession()).toEqual({ email: "user@example.com" });
  });

  it("fails soft to null when the read itself throws", async () => {
    mocks.cookieGet.mockReturnValue({ value: `${encodeEmail("user@example.com")}.raw-session-value` });
    mockContainer.item.mockReturnValueOnce({
      read: vi.fn(async () => {
        throw new Error("cosmos unavailable");
      }),
    });
    expect(await getSession()).toBeNull();
  });
});

// ---------------------------------------------------------------------
// createSessionForEmail
// ---------------------------------------------------------------------

describe("createSessionForEmail", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.itemsCreate.mockResolvedValue(undefined);
  });

  it("creates a new user document when none exists yet", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });

    await createSessionForEmail("user@example.com", "1.2.3.4", "test-agent");

    const userCreateCall = mocks.itemsCreate.mock.calls.find((call) => call[0].type === "user");
    expect(userCreateCall).toBeDefined();
    expect(userCreateCall![0]).toMatchObject({
      id: "user@example.com",
      pk: "user@example.com",
      type: "user",
      email: "user@example.com",
    });
  });

  it("does not create a duplicate user document when one already exists", async () => {
    mocks.read.mockResolvedValue({ resource: { id: "user@example.com", type: "user" } });

    await createSessionForEmail("user@example.com", "1.2.3.4", "test-agent");

    const userCreateCall = mocks.itemsCreate.mock.calls.find((call) => call[0].type === "user");
    expect(userCreateCall).toBeUndefined();
  });

  // Documented directly in the source: sign-in must still succeed even if
  // the user-document existence check/create fails outright (e.g. a
  // network blip) - only the session itself is load-bearing.
  it("still creates a session and returns a cookie value even when the user-document check throws", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockContainer.item.mockReturnValueOnce({
      read: vi.fn(async () => {
        throw new Error("cosmos unavailable");
      }),
    });

    const result = await createSessionForEmail("user@example.com", "1.2.3.4", "test-agent");

    expect(result.cookieValue).toBeTruthy();
    expect(consoleErrorSpy).toHaveBeenCalled();
    const sessionCreateCall = mocks.itemsCreate.mock.calls.find((call) => call[0].type === "session");
    expect(sessionCreateCall).toBeDefined();

    consoleErrorSpy.mockRestore();
  });

  it("creates a session document scoped to the email, with the given ip/userAgent and the standard TTL", async () => {
    mocks.read.mockResolvedValue({ resource: { id: "user@example.com" } });

    await createSessionForEmail("user@example.com", "9.8.7.6", "curl/8.0");

    const sessionCreateCall = mocks.itemsCreate.mock.calls.find((call) => call[0].type === "session");
    expect(sessionCreateCall![0]).toMatchObject({
      pk: "user@example.com",
      type: "session",
      ttl: SESSION_TTL_SECONDS,
      ip: "9.8.7.6",
      userAgent: "curl/8.0",
    });
  });

  it("sets expiresAt roughly SESSION_TTL_SECONDS (30 days) after now", async () => {
    mocks.read.mockResolvedValue({ resource: { id: "user@example.com" } });
    const before = Date.now();

    await createSessionForEmail("user@example.com", "1.2.3.4", "test-agent");

    const sessionCreateCall = mocks.itemsCreate.mock.calls.find((call) => call[0].type === "session");
    const expiresAt = new Date(sessionCreateCall![0].expiresAt).getTime();
    const expected = before + SESSION_TTL_SECONDS * 1000;
    expect(expiresAt).toBeGreaterThan(expected - 5000);
    expect(expiresAt).toBeLessThan(expected + 5000);
  });

  it("returns maxAge equal to SESSION_TTL_SECONDS", async () => {
    mocks.read.mockResolvedValue({ resource: { id: "user@example.com" } });
    const result = await createSessionForEmail("user@example.com", "1.2.3.4", "test-agent");
    expect(result.maxAge).toBe(SESSION_TTL_SECONDS);
  });

  // The real security property: the cookie value handed back must
  // genuinely encode the same email, and its token half must genuinely
  // hash to exactly the id that got stored as the session document -
  // real SHA-256/base64url on both sides, not two independent stand-ins.
  it("returns a cookieValue whose two halves genuinely match what was stored (real crypto, not mocked)", async () => {
    mocks.read.mockResolvedValue({ resource: { id: "user@example.com" } });

    const result = await createSessionForEmail("user@example.com", "1.2.3.4", "test-agent");

    const [encodedEmail, sessionRaw] = result.cookieValue.split(".");
    expect(decodeEmail(encodedEmail)).toBe("user@example.com");

    const sessionCreateCall = mocks.itemsCreate.mock.calls.find((call) => call[0].type === "session");
    expect(sessionCreateCall![0].id).toBe(hashToken(sessionRaw));
  });

  it("never reuses the same session token across two separate sign-ins", async () => {
    mocks.read.mockResolvedValue({ resource: { id: "user@example.com" } });

    const first = await createSessionForEmail("user@example.com", "1.2.3.4", "test-agent");
    const second = await createSessionForEmail("user@example.com", "1.2.3.4", "test-agent");

    expect(first.cookieValue).not.toBe(second.cookieValue);
  });

  // End-to-end loop: a cookie value built by createSessionForEmail (real
  // crypto) is fed straight into getSession (also real crypto), with only
  // Cosmos itself mocked to hand back exactly the document that was
  // "created" - proving the two functions genuinely interoperate.
  it("round-trips through getSession: a freshly created session validates successfully", async () => {
    mocks.read.mockResolvedValue({ resource: { id: "user@example.com" } });
    const { cookieValue } = await createSessionForEmail("user@example.com", "1.2.3.4", "test-agent");
    const sessionCreateCall = mocks.itemsCreate.mock.calls.find((call) => call[0].type === "session");
    const storedSessionDoc = sessionCreateCall![0];

    resetAllMocks();
    mocks.cookieGet.mockReturnValue({ value: cookieValue });
    mocks.read.mockResolvedValue({
      resource: { type: "session", expiresAt: storedSessionDoc.expiresAt },
    });

    expect(await getSession()).toEqual({ email: "user@example.com" });
  });
});
