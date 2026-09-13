// Place at: src/app/api/auth/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { hashToken, decodeEmail } from "@/lib/auth/crypto";
import { createSessionForEmail } from "@/lib/auth/session";
import { getSafeRedirectPath } from "@/lib/auth/safeRedirect";
import { isTwoFactorEnabled, createPendingLogin } from "@/lib/auth/twoFactor";

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

function isPreconditionFailed(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  const statusCode = (err as { statusCode?: unknown }).statusCode;
  return code === 412 || statusCode === 412;
}

export async function GET(req: NextRequest) {
  const container = getContainer();
  const url = new URL(req.url);
  const rawToken = url.searchParams.get("token");
  const encodedEmail = url.searchParams.get("e");
  // Re-validated here even though request-link already checked it once -
  // this URL is plain, copyable text sitting in an inbox, not something
  // to trust just because an earlier step approved it. See
  // safeRedirect.ts for the full reasoning.
  const safeRedirect = getSafeRedirectPath(url.searchParams.get("redirect"));

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

  // Conditioned on `used` still being false at the moment Cosmos applies
  // this patch - a plain unconditional patch here let two near-
  // simultaneous requests for the exact same link (two tabs, or an
  // email security scanner prefetching the link right as the real user
  // clicks it) both pass the check above before either patch landed,
  // each independently creating a session. Cosmos evaluates `condition`
  // atomically against the current document server-side, so only one of
  // two racing requests can ever win this.
  try {
    await container.item(tokenHash, email).patch({
      operations: [{ op: "replace", path: "/used", value: true }],
      condition: "from c where c.used = false",
    });
  } catch (err) {
    if (isPreconditionFailed(err)) {
      return NextResponse.redirect(`${APP_URL}/login?error=expired_link`);
    }
    throw err;
  }

  // A real magic-link click is now independently confirmed - if this
  // account has 2FA on, that's only step one. Hand off to a short-lived
  // pending-login cookie instead of a real session; the code-entry page
  // trades it in for the real thing (see totp/login-verify/route.ts).
  if (await isTwoFactorEnabled(email)) {
    const { cookieValue, maxAge } = await createPendingLogin(email);
    const redirectParam = safeRedirect ? `?redirect=${encodeURIComponent(safeRedirect)}` : "";
    const response = NextResponse.redirect(`${APP_URL}/login/verify-2fa${redirectParam}`);
    response.cookies.set("totp_pending", cookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge,
    });
    return response;
  }

  const { cookieValue, maxAge } = await createSessionForEmail(email, getClientIp(req), req.headers.get("user-agent") ?? "unknown");

  const response = NextResponse.redirect(`${APP_URL}${safeRedirect ?? "/dashboard"}`);

  response.cookies.set("session", cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });

  return response;
}
