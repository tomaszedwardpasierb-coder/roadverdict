// Place at: src/app/api/vault/reauth/route.ts
//
// Step-up re-authentication for the Vault - reached from an already
// signed-in session (unlike totp/login-verify, this is never part of
// signing in itself). Requires Pro and 2FA independently of whatever the
// UI already gated on, since a route must never trust that the client
// only got here through the "correct" screen.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isPro } from "@/lib/subscriptions";
import { isTwoFactorEnabled, verifyLoginCode, checkTotpRateLimit, recordTotpAttempt } from "@/lib/auth/twoFactor";
import { createVaultSession, VAULT_SESSION_COOKIE_NAME } from "@/lib/tracker/vaultSession";
import { detectBrowser, lookupCountry, recordVaultAccess } from "@/lib/tracker/vaultAudit";

export const dynamic = "force-dynamic";

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!(await isPro(session.email))) {
    return NextResponse.json({ error: "The Vault is a Premium feature." }, { status: 403 });
  }
  if (!(await isTwoFactorEnabled(session.email))) {
    return NextResponse.json({ error: "Enable two-factor authentication in Settings to use the Vault." }, { status: 403 });
  }

  const allowed = await checkTotpRateLimit(session.email, "vault");
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { code } = body as { code?: string };
  if (!code) {
    return NextResponse.json({ error: "Enter your 6-digit code, or a backup code." }, { status: 400 });
  }

  const codeValid = await verifyLoginCode(session.email, code);
  if (!codeValid) {
    await recordTotpAttempt(session.email, "vault");
    return NextResponse.json({ error: "Incorrect code." }, { status: 401 });
  }

  const browser = detectBrowser(request.headers.get("user-agent") ?? "");
  const country = await lookupCountry(getClientIp(request));

  const [{ cookieValue, maxAge }, previousAccess] = await Promise.all([
    createVaultSession(session.email),
    recordVaultAccess(session.email, { browser, country }),
  ]);

  const response = NextResponse.json({ ok: true, previousAccess });
  response.cookies.set(VAULT_SESSION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return response;
}
