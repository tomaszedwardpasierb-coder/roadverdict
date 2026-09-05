import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateToken, hashToken, encodeEmail, decodeEmail, encryptSecret, decryptSecret } from "@/lib/auth/crypto";
import { randomBytes } from "crypto";

// generateToken/hashToken are real crypto (randomBytes/SHA-256) - exercised
// for real here rather than mocked, per this repo's convention (see
// tests/unit/receiptRequest.test.ts). hashToken itself already has direct
// coverage there; this file focuses on generateToken, encodeEmail and
// decodeEmail, which have never been exercised unmocked before.

describe("generateToken", () => {
  it("returns a raw value and a hash that genuinely match", () => {
    const { raw, hash } = generateToken();
    expect(hash).toBe(hashToken(raw));
  });

  it("returns a URL-safe raw token (no +, /, or = padding characters)", () => {
    const { raw } = generateToken();
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("derives the raw token from 32 random bytes (43-character base64url, no padding)", () => {
    const { raw } = generateToken();
    // 32 bytes -> ceil(32*8/6) = 43 base64 characters, no padding in base64url.
    expect(raw).toHaveLength(43);
  });

  it("returns a 64-character lowercase hex SHA-256 hash", () => {
    const { hash } = generateToken();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  // The entire point of a session/magic-link token: it must be
  // unpredictable. Not a proof of cryptographic strength, but a basic
  // sanity check that two calls never collide and aren't visibly related.
  it("never generates the same raw token (or hash) twice across many calls", () => {
    const rawValues = new Set<string>();
    const hashValues = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const { raw, hash } = generateToken();
      rawValues.add(raw);
      hashValues.add(hash);
    }
    expect(rawValues.size).toBe(200);
    expect(hashValues.size).toBe(200);
  });
});

describe("encodeEmail / decodeEmail", () => {
  it("round-trips a plain email exactly", () => {
    const encoded = encodeEmail("user@example.com");
    expect(decodeEmail(encoded)).toBe("user@example.com");
  });

  it("lowercases and trims the email before encoding", () => {
    const encoded = encodeEmail("  User@Example.COM  ");
    expect(decodeEmail(encoded)).toBe("user@example.com");
  });

  it("produces a URL-safe encoding (no +, /, or = padding characters)", () => {
    const encoded = encodeEmail("user+tag@example.com");
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces different encodings for different emails", () => {
    expect(encodeEmail("a@example.com")).not.toBe(encodeEmail("b@example.com"));
  });

  it("is not itself a secret - encoding is deterministic for the same input", () => {
    expect(encodeEmail("user@example.com")).toBe(encodeEmail("user@example.com"));
  });

  it("decodes a differently-cased encoding of the same email to the same normalized value", () => {
    // Two different original inputs that normalize to the same email
    // must decode identically, since encodeEmail always normalizes first.
    expect(decodeEmail(encodeEmail("User@Example.com"))).toBe(decodeEmail(encodeEmail("user@example.com")));
  });

  it("does not throw on a malformed base64url string, even though the result is meaningless", () => {
    // decodeEmail is a courtesy obfuscation, not a security boundary, so
    // it deliberately has no validation. Confirms it fails soft (garbage
    // in, garbage out) rather than throwing on malformed input from a
    // tampered cookie/query string.
    expect(() => decodeEmail("not-valid-base64!!!")).not.toThrow();
  });
});

describe("encryptSecret / decryptSecret", () => {
  const ORIGINAL_KEY = process.env.TOTP_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
    else process.env.TOTP_ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  it("round-trips a plaintext secret exactly", () => {
    const encrypted = encryptSecret("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(encrypted)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("produces a different ciphertext each time for the same plaintext (random IV per call)", () => {
    const a = encryptSecret("same-secret");
    const b = encryptSecret("same-secret");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same-secret");
    expect(decryptSecret(b)).toBe("same-secret");
  });

  it("fails to decrypt if the ciphertext has been tampered with", () => {
    const encrypted = encryptSecret("JBSWY3DPEHPK3PXP");
    const [iv, tag, data] = encrypted.split(".");
    const tamperedData = data.slice(0, -2) + (data.slice(-2) === "AA" ? "BB" : "AA");
    expect(() => decryptSecret([iv, tag, tamperedData].join("."))).toThrow();
  });

  it("fails to decrypt under a different key than the one it was encrypted with", () => {
    const encrypted = encryptSecret("JBSWY3DPEHPK3PXP");
    process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString("hex");
    expect(() => decryptSecret(encrypted)).toThrow();
  });

  it("throws clearly when TOTP_ENCRYPTION_KEY is not configured", () => {
    delete process.env.TOTP_ENCRYPTION_KEY;
    expect(() => encryptSecret("anything")).toThrow(/TOTP_ENCRYPTION_KEY/);
  });

  it("throws clearly when TOTP_ENCRYPTION_KEY is the wrong length", () => {
    process.env.TOTP_ENCRYPTION_KEY = "tooshort";
    expect(() => encryptSecret("anything")).toThrow(/32 bytes/);
  });
});
