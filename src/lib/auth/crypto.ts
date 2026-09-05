// Place at: src/lib/auth/crypto.ts
import { randomBytes, createHash, createCipheriv, createDecipheriv } from "crypto";

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

// Real, reversible encryption - unlike hashToken above, a TOTP secret
// has to be read back in plaintext to check a future code against it,
// so a one-way hash can't work here. AES-256-GCM with a random IV per
// call (never reused - reuse under GCM breaks its confidentiality
// guarantee outright) and its auth tag stored alongside the ciphertext,
// so a tampered value fails to decrypt instead of silently returning
// garbage. TOTP_ENCRYPTION_KEY is 32 raw bytes, hex-encoded (generate
// with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`),
// set once in Azure App Settings and never rotated without also
// re-encrypting every stored secret - there's no key-rotation support
// here, same as every other secret this app already depends on.
const ENCRYPTION_ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const keyHex = process.env.TOTP_ENCRYPTION_KEY;
  if (!keyHex) throw new Error("TOTP_ENCRYPTION_KEY is not configured.");
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("TOTP_ENCRYPTION_KEY must be 32 bytes (64 hex characters).");
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, encrypted].map((buf) => buf.toString("base64url")).join(".");
}

export function decryptSecret(payload: string): string {
  const [ivPart, tagPart, dataPart] = payload.split(".");
  if (!ivPart || !tagPart || !dataPart) throw new Error("Malformed encrypted payload.");
  const iv = Buffer.from(ivPart, "base64url");
  const authTag = Buffer.from(tagPart, "base64url");
  const data = Buffer.from(dataPart, "base64url");
  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
