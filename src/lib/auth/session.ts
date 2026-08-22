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
export async function createSessionForEmail(email: string, ip: string, userAgent: string): Promise<{ cookieValue: string; maxAge: number }> {
  const container = getContainer();

  // .item(id, pk).read() on a non-existent item resolves successfully
  // with an empty resource, rather than throwing - the same Cosmos SDK
  // behavior getSession() above already accounts for via its own
  // !resource check. A bare try/catch here never actually caught the
  // "doesn't exist yet" case at all, since that path never threw in
  // the first place - which is why no user document has ever actually
  // been created for anyone, despite every real sign-in this app has
  // ever had.
  try {
    const { resource: existingUser } = await container.item(email, email).read();
    if (!existingUser) {
      await container.items.create({
        id: email,
        pk: email,
        type: "user",
        email,
        createdAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    // A genuine failure to check/create the user document (a network
    // blip, a permissions issue) shouldn't block sign-in itself, which
    // is the part that actually matters here - worst case, this
    // account's "first seen" record ends up created on a later sign-in
    // instead. Logged rather than silently swallowed, unlike before -
    // silence here is exactly what let the bug above go unnoticed for
    // as long as it did.
    console.error(`createSessionForEmail: failed to check/create user document for ${email}:`, err);
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
    userAgent,
  });

  return { cookieValue: `${encodeEmail(email)}.${sessionRaw}`, maxAge: SESSION_TTL_SECONDS };
}
