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

export async function createAdminSession(): Promise<string> {
  const { raw, hash } = generateToken();
  const container = getContainer();
  await container.items.upsert({
    id: hash,
    pk: ADMIN_PK,
    type: "adminSession",
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
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
