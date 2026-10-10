// "Continue with Google": the ID token check, against a real RSA key pair
// standing in for Google's, and the website's attempt cookie.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSign, generateKeyPairSync } from "crypto";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/fetchWithTimeout", () => ({ fetchWithTimeout: fetchMock }));

import {
  decodeAttempt,
  encodeAttempt,
  googleAuthUrl,
  googleWebSignInEnabled,
  newGoogleAttempt,
  resetGoogleKeyCache,
  verifyGoogleIdToken,
} from "@/lib/auth/googleSignIn";

const CLIENT_ID = "web-client.apps.googleusercontent.com";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "key-1", alg: "RS256", use: "sig" };
const NOW = new Date("2026-10-10T12:00:00Z");
const nowSeconds = Math.floor(NOW.getTime() / 1000);

function b64(obj: object): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function token(claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}): string {
  const h = b64({ alg: "RS256", kid: "key-1", typ: "JWT", ...header });
  const p = b64({
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    iat: nowSeconds - 10,
    exp: nowSeconds + 3600,
    email: "Rider@Example.com",
    email_verified: true,
    ...claims,
  });
  const signer = createSign("RSA-SHA256");
  signer.update(`${h}.${p}`);
  return `${h}.${p}.${signer.sign(privateKey).toString("base64url")}`;
}

beforeEach(() => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = CLIENT_ID;
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secret";
  resetGoogleKeyCache();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ keys: [jwk] }) });
});
afterEach(() => {
  delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
});

describe("verifyGoogleIdToken", () => {
  it("returns the verified email, lower-cased", async () => {
    expect(await verifyGoogleIdToken(token(), { now: NOW })).toBe("rider@example.com");
  });

  it("refuses a token signed by anyone else", async () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    const [h, p] = token().split(".");
    const forged = `${h}.${p}.${createSign("RSA-SHA256").update(`${h}.${p}`).sign(other).toString("base64url")}`;
    expect(await verifyGoogleIdToken(forged, { now: NOW })).toBeNull();
  });

  it("refuses a token changed after signing", async () => {
    const [h, , s] = token().split(".");
    const tampered = `${h}.${b64({ iss: "https://accounts.google.com", aud: CLIENT_ID, exp: nowSeconds + 3600, email: "victim@example.com", email_verified: true })}.${s}`;
    expect(await verifyGoogleIdToken(tampered, { now: NOW })).toBeNull();
  });

  it("refuses another app's token, an expired one, a wrong issuer, an unverified email, and alg none", async () => {
    expect(await verifyGoogleIdToken(token({ aud: "someone-else" }), { now: NOW })).toBeNull();
    expect(await verifyGoogleIdToken(token({ exp: nowSeconds - 120 }), { now: NOW })).toBeNull();
    expect(await verifyGoogleIdToken(token({ iss: "https://evil.example" }), { now: NOW })).toBeNull();
    expect(await verifyGoogleIdToken(token({ email_verified: false }), { now: NOW })).toBeNull();
    expect(await verifyGoogleIdToken(token({}, { alg: "none" }), { now: NOW })).toBeNull();
  });

  it("checks the nonce when the website's flow gives one", async () => {
    expect(await verifyGoogleIdToken(token({ nonce: "abc" }), { nonce: "abc", now: NOW })).toBe("rider@example.com");
    expect(await verifyGoogleIdToken(token({ nonce: "abc" }), { nonce: "xyz", now: NOW })).toBeNull();
  });

  it("fetches Google's keys again for a key id it hasn't seen", async () => {
    expect(await verifyGoogleIdToken(token(), { now: NOW })).toBe("rider@example.com");
    const rotated = { ...jwk, kid: "key-2" };
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ keys: [jwk, rotated] }) });
    expect(await verifyGoogleIdToken(token({}, { kid: "key-2" }), { now: NOW })).toBe("rider@example.com");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does nothing when Google sign-in isn't set up", async () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    expect(await verifyGoogleIdToken(token(), { now: NOW })).toBeNull();
    expect(googleWebSignInEnabled()).toBe(false);
  });
});

describe("the website's attempt", () => {
  it("round-trips through the cookie, and the Google URL carries its state, nonce and PKCE challenge", () => {
    const attempt = newGoogleAttempt("/dashboard?addVehicle=car", "google");
    expect(decodeAttempt(encodeAttempt(attempt))).toEqual(attempt);
    expect(decodeAttempt("not-a-cookie")).toBeNull();
    const url = new URL(googleAuthUrl(attempt, "https://roadverdict.co.uk/api/auth/google/callback"));
    expect(url.searchParams.get("state")).toBe(attempt.state);
    expect(url.searchParams.get("nonce")).toBe(attempt.nonce);
    expect(url.searchParams.get("scope")).toBe("openid email");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).not.toBe(attempt.verifier);
  });
});
