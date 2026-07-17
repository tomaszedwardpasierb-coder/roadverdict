// Place at: src/lib/auth/crypto.ts
import { randomBytes, createHash } from "crypto";

// Generates a random, URL-safe token and its SHA-256 hash.
// Only the hash is ever written to Cosmos DB - the raw value is emailed
// to the user (magic link) or stored in their browser cookie (session)
// and never touches the database in plaintext.
export function generateToken() {
  const raw = randomBytes(32).toString("base64url");
  const hash = hashToken(raw);
  return { raw, hash };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Email isn't secret, but it's convenient to keep it out of raw query
// strings / cookies as a courtesy - this is obfuscation, not encryption.
export function encodeEmail(email: string): string {
  return Buffer.from(email.toLowerCase().trim()).toString("base64url");
}

export function decodeEmail(encoded: string): string {
  return Buffer.from(encoded, "base64url").toString("utf8");
}
