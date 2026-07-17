// Place at: src/app/api/auth/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { generateToken, hashToken, decodeEmail, encodeEmail } from "@/lib/auth/crypto";

export const dynamic = "force-dynamic";

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

// Built explicitly from APP_URL rather than the incoming request's own
// URL - Azure proxies external traffic to the container over an
// internal address (this is where "localhost:8080" was coming from),
// so a redirect based on req.url picks up that internal address
// instead of the real public domain.
const APP_URL = process.env.APP_URL;

export async function GET(req: NextRequest) {
  const container = getContainer();
  const url = new URL(req.url);
  const rawToken = url.searchParams.get("token");
  const encodedEmail = url.searchParams.get("e");

  if (!rawToken || !encodedEmail) {
    return NextResponse.redirect(`${APP_URL}/login?error=invalid_link`);
  }

  const email = decodeEmail(encodedEmail);
  const tokenHash = hashToken(rawToken);

  let magicLinkDoc;
  try {
    const { resource } = await container.item(tokenHash, email).read();
    magicLinkDoc = resource;
  } catch {
    return NextResponse.redirect(`${APP_URL}/login?error=invalid_link`);
  }

  if (
    !magicLinkDoc ||
    magicLinkDoc.type !== "magicLink" ||
    magicLinkDoc.used ||
    new Date(magicLinkDoc.expiresAt) < new Date()
  ) {
    return NextResponse.redirect(`${APP_URL}/login?error=expired_link`);
  }

  await container.item(tokenHash, email).patch([
    { op: "replace", path: "/used", value: true },
  ]);

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
  });

  const response = NextResponse.redirect(`${APP_URL}/dashboard`);

  response.cookies.set("session", `${encodeEmail(email)}.${sessionRaw}`, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  return response;
}
