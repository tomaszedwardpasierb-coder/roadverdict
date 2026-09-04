// Place at: src/lib/admin/session.ts
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { getContainer } from "@/lib/cosmos";
import { hashToken, generateToken } from "@/lib/auth/crypto";

const ADMIN_PK = "admin";
const PENDING_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function verifyAdminPassword(password: string): boolean {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) return false;
  return bcrypt.compareSync(password, hash);
}

export async function createPendingTotp(): Promise<string> {
  const { raw, hash } = generateToken();
  const container = getContainer();
  await container.items.upsert({
    id: hash,
    pk: ADMIN_PK,
    type: "adminPendingTotp",
    expiresAt: new Date(Date.now() + PENDING_TTL_MS).toISOString(),
    // Every sibling short-lived doc in this file self-cleans via Cosmos
    // ttl - this one didn't, so a pending login abandoned mid-flow (tab
    // closed before the TOTP step) sat here forever despite being
    // functionally dead after PENDING_TTL_MS.
    ttl: Math.ceil(PENDING_TTL_MS / 1000),
  });
  return raw;
}

export async function consumePendingTotp(raw: string): Promise<boolean> {
  const container = getContainer();
  const hash = hashToken(raw);
  try {
    const { resource } = await container.item(hash, ADMIN_PK).read();
    if (!resource || resource.type !== "adminPendingTotp") return false;
    if (new Date(resource.expiresAt) < new Date()) return false;
    await container.item(hash, ADMIN_PK).delete();
    return true;
  } catch {
    return false;
  }
}

// Burns the pending token on a wrong TOTP guess, same as a successful
// one - without this, a single correct password gave an attacker the
// whole 5-minute PENDING_TTL to try codes against one static token
// instead of needing to re-prove the password for every fresh attempt.
export async function invalidatePendingTotp(raw: string): Promise<void> {
  const container = getContainer();
  const hash = hashToken(raw);
  try {
    await container.item(hash, ADMIN_PK).delete();
  } catch {
    // already gone - fine
  }
}

// Same one-document-per-attempt, Cosmos-TTL-expired pattern as
// reportAccess.ts's checkPlateRateLimit/recordPlateAttempt (see that
// file's comment for why - no read-modify-write race). Global rather
// than per-IP: there is exactly one legitimate admin, so a small global
// cap on both the password and TOTP steps is a simpler and at least as
// effective mitigation than trying to key it off a client IP that a
// proxy header can't be fully trusted to report anyway.
const LOGIN_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const MAX_LOGIN_ATTEMPTS_PER_WINDOW = 10;

function loginAttemptIdPrefix(kind: "password" | "totp"): string {
  return `admin-login-attempt:${kind}:`;
}

export async function checkAdminLoginRateLimit(kind: "password" | "totp"): Promise<{ allowed: boolean }> {
  const container = getContainer();
  const { resources } = await container.items
    .query<{ id: string }>(
      {
        query: "SELECT c.id FROM c WHERE c.type = 'adminLoginAttempt' AND STARTSWITH(c.id, @prefix)",
        parameters: [{ name: "@prefix", value: loginAttemptIdPrefix(kind) }],
      },
      { partitionKey: ADMIN_PK }
    )
    .fetchAll();
  return { allowed: resources.length < MAX_LOGIN_ATTEMPTS_PER_WINDOW };
}

export async function recordAdminLoginAttempt(kind: "password" | "totp"): Promise<void> {
  const container = getContainer();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await container.items.create({
    id: `${loginAttemptIdPrefix(kind)}${suffix}`,
    pk: ADMIN_PK,
    type: "adminLoginAttempt",
    createdAt: new Date().toISOString(),
    ttl: LOGIN_RATE_LIMIT_WINDOW_SECONDS,
  });
}

export async function createAdminSession(): Promise<string> {
  const { raw, hash } = generateToken();
  const container = getContainer();
  await container.items.upsert({
    id: hash,
    pk: ADMIN_PK,
    type: "adminSession",
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    // Same gap as createPendingTotp above - without this, an admin who
    // never explicitly logs out (closes the browser, clears cookies)
    // leaves this doc behind forever despite being dead after
    // SESSION_TTL_MS, unlike the regular user `session` doc type.
    ttl: Math.ceil(SESSION_TTL_MS / 1000),
  });
  return raw;
}

export async function getAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("admin_session")?.value;
  if (!raw) return false;
  const container = getContainer();
  const hash = hashToken(raw);
  try {
    const { resource } = await container.item(hash, ADMIN_PK).read();
    if (!resource || resource.type !== "adminSession") return false;
    if (new Date(resource.expiresAt) < new Date()) return false;
    return true;
  } catch {
    return false;
  }
}

export async function deleteAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("admin_session")?.value;
  if (!raw) return;
  const container = getContainer();
  const hash = hashToken(raw);
  try {
    await container.item(hash, ADMIN_PK).delete();
  } catch {
    // already gone - fine
  }
}
