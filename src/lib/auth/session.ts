// Place at: src/lib/auth/session.ts
import { cookies, headers } from "next/headers";
import { getContainer } from "@/lib/cosmos";
import { hashToken, decodeEmail, generateToken, encodeEmail } from "@/lib/auth/crypto";
import { isAccountBlocked } from "@/lib/tracker/userDoc";
import { getAssistantConfig } from "@/lib/tracker/assistantConfig";

// The Android app can't hold an httpOnly cookie the way a browser does, so
// it sends the very same `${encodedEmail}.${sessionRaw}` value as a bearer
// token instead - one session format, one lookup, whichever way it
// arrives. The cookie wins when both are present, so nothing about how a
// browser signs in changes.
export function parseBearerToken(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  return match ? match[1] : null;
}

export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get("session")?.value;
  if (fromCookie) return fromCookie;
  const headerStore = await headers();
  return parseBearerToken(headerStore.get("authorization"));
}

export async function getSession(): Promise<{ email: string } | null> {
  const container = getContainer();
  const raw = await getSessionToken();
  if (!raw) return null;

  const [encodedEmail, sessionRaw] = raw.split(".");
  if (!encodedEmail || !sessionRaw) return null;

  const email = decodeEmail(encodedEmail);
  const sessionHash = hashToken(sessionRaw);

  try {
    const { resource } = await container.item(sessionHash, email).read();
    if (!resource || resource.type !== "session") return null;
    if (new Date(resource.expiresAt) < new Date()) return null;
    // A blocked account's existing session cookie resolves to "not
    // signed in," the same as if it never existed - this is the one
    // choke point every dashboard page and API route already goes
    // through, so blocking takes effect immediately, not just on the
    // account's next login attempt.
    if (await isAccountBlocked(email)) return null;
    if (resource.client === "app") await renewAppSession(sessionHash, email, resource.expiresAt);
    return { email };
  } catch {
    return null;
  }
}

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

// Phone sessions last longer and slide: someone who opens the app at
// least once every 90 days never has to sign in again, while a lost or
// abandoned phone's session still dies on its own. Renewal is written at
// most once a day per session rather than on every request - a single
// app screen fires several API calls, and each renewal is a Cosmos write.
export const APP_SESSION_TTL_SECONDS = 90 * 24 * 60 * 60;
const APP_SESSION_RENEW_AFTER_SECONDS = 24 * 60 * 60;

async function renewAppSession(sessionHash: string, email: string, expiresAt: string): Promise<void> {
  const remainingSeconds = (new Date(expiresAt).getTime() - Date.now()) / 1000;
  if (remainingSeconds > APP_SESSION_TTL_SECONDS - APP_SESSION_RENEW_AFTER_SECONDS) return;
  try {
    await getContainer()
      .item(sessionHash, email)
      .patch([
        { op: "set", path: "/expiresAt", value: new Date(Date.now() + APP_SESSION_TTL_SECONDS * 1000).toISOString() },
        // Cosmos counts ttl from the document's last write, so re-setting
        // it alongside expiresAt keeps the two in step.
        { op: "set", path: "/ttl", value: APP_SESSION_TTL_SECONDS },
      ]);
  } catch (err) {
    // The request itself is still validly signed in - a failed renewal
    // only means this session expires on its old date unless a later
    // request renews it.
    console.error(`renewAppSession: failed to renew app session for ${email}:`, err);
  }
}

// Shared by the real magic-link verify route and the demo-account
// bypass - both need to end up with an identical, equally-real session,
// not two slightly different implementations of "logged in".
export async function createSessionForEmail(
  email: string,
  ip: string,
  userAgent: string,
  options: { client?: "web" | "app" } = {}
): Promise<{ cookieValue: string; maxAge: number }> {
  const isApp = options.client === "app";
  const ttlSeconds = isApp ? APP_SESSION_TTL_SECONDS : SESSION_TTL_SECONDS;
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
      // Off by default - only included when an admin has turned on
      // /tomasz's global "auto-enable for new signups" toggle
      // (assistantConfig.autoEnableOnboardingForNewSignups). The only
      // other way any account ever gets the checklist is /tomasz's own
      // per-account EnableOnboardingButton - see UserDoc.onboarding's
      // own comment in userDoc.ts.
      const config = await getAssistantConfig();
      await container.items.create({
        id: email,
        pk: email,
        type: "user",
        email,
        createdAt: new Date().toISOString(),
        ...(config?.autoEnableOnboardingForNewSignups ? { onboarding: { completedSteps: [] } } : {}),
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
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  await container.items.create({
    id: sessionHash,
    pk: email,
    type: "session",
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ttl: ttlSeconds,
    ip,
    userAgent,
    ...(isApp ? { client: "app" } : {}),
  });

  return { cookieValue: `${encodeEmail(email)}.${sessionRaw}`, maxAge: ttlSeconds };
}
