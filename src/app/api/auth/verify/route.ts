// Place at: src/app/api/auth/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { hashToken, decodeEmail } from "@/lib/auth/crypto";
import { createSessionForEmail } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const APP_URL = process.env.APP_URL ?? "https://roadverdict.co.uk";

// Azure sits in front of the app as a reverse proxy, so the real
// visitor IP arrives via this header, not the raw connection - the
// first entry is the original client, anything after it is
// intermediate proxies.
function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

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

  const { cookieValue, maxAge } = await createSessionForEmail(email, getClientIp(req));

  const response = NextResponse.redirect(`${APP_URL}/dashboard`);

  response.cookies.set("session", cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });

  return response;
}
