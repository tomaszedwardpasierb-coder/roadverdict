// Place at: src/lib/auth/session.ts
import { cookies } from "next/headers";
import { getContainer } from "@/lib/cosmos";
import { hashToken, decodeEmail, generateToken, encodeEmail } from "@/lib/auth/crypto";

export async function getSession(): Promise<{ email: string } | null> {
  const container = getContainer();
  const cookieStore = await cookies();
  const raw = cookieStore.get("session")?.value;
  if (!raw) return null;

  const [encodedEmail, sessionRaw] = raw.split(".");
  if (!encodedEmail || !sessionRaw) return null;

  const email = decodeEmail(encodedEmail);
  const sessionHash = hashToken(sessionRaw);

  try {
    const { resource } = await container.item(sessionHash, email).read();
    if (!resource || resource.type !== "session") return null;
    if (new Date(resource.expiresAt) < new Date()) return null;
    return { email };
  } catch {
    return null;
  }
}

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

// Shared by the real magic-link verify route and the demo-account
// bypass - both need to end up with an identical, equally-real session,
// not two slightly different implementations of "logged in".
export async function createSessionForEmail(email: string, ip: string): Promise<{ cookieValue: string; maxAge: number }> {
  const container = getContainer();

  try {
    await container.item(email, email).read();
  } catch {
    await container.items.create({
      id: email,
      pk: email,
      type: "user",
      email,
      createdAt: new Date().toISOString(),
    });
  }

  const { raw: sessionRaw, hash: sessionHash } = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);

  await container.items.create({
    id: sessionHash,
    pk: email,
    type: "session",
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ttl: SESSION_TTL_SECONDS,
    ip,
  });

  return { cookieValue: `${encodeEmail(email)}.${sessionRaw}`, maxAge: SESSION_TTL_SECONDS };
}
