// Place at: src/app/api/auth/app/verify-code/route.ts
//
// Step two of signing in to the Android app: trade the emailed code for
// a session token the app keeps in the phone's secure storage and sends
// back as `Authorization: Bearer <token>` (see getSession). An account
// with 2FA on gets a short-lived pending token instead, which
// verify-2fa trades for the real session once the authenticator code
// checks out - the same two-step hand-off the web flow does with its
// totp_pending cookie.
import { NextRequest, NextResponse } from "next/server";
import { isAccountBlocked } from "@/lib/tracker/userDoc";
import { getClientIp } from "@/lib/auth/signInRateLimit";
import { consumeAppLoginCode, isAppCodeGuessingLocked } from "@/lib/auth/appLoginCode";
import { isTwoFactorEnabled, createPendingLogin } from "@/lib/auth/twoFactor";
import { createSessionForEmail } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { email, code } = (body ?? {}) as { email?: unknown; code?: unknown };
  if (typeof email !== "string" || !email.includes("@") || typeof code !== "string" || !/^\d{6}$/.test(code.trim())) {
    return NextResponse.json({ error: "Enter the 6-digit code from your email." }, { status: 400 });
  }
  const normalizedEmail = email.toLowerCase().trim();

  if (await isAppCodeGuessingLocked(normalizedEmail)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const result = await consumeAppLoginCode(normalizedEmail, code.trim());
  if (result === "expired") {
    return NextResponse.json({ error: "That code has expired - request a new one." }, { status: 401 });
  }
  if (result === "invalid") {
    return NextResponse.json({ error: "Incorrect code." }, { status: 401 });
  }

  // Re-checked here as well as at request time - an account blocked in
  // the ten minutes the code was live mustn't still get a session.
  if (await isAccountBlocked(normalizedEmail)) {
    return NextResponse.json({ error: "This account is no longer able to sign in." }, { status: 403 });
  }

  if (await isTwoFactorEnabled(normalizedEmail)) {
    const { cookieValue, maxAge } = await createPendingLogin(normalizedEmail);
    return NextResponse.json({ twoFactorRequired: true, pendingToken: cookieValue, expiresInSeconds: maxAge });
  }

  const { cookieValue, maxAge } = await createSessionForEmail(
    normalizedEmail,
    getClientIp(req),
    req.headers.get("user-agent") ?? "unknown",
    { client: "app" }
  );
  return NextResponse.json({ token: cookieValue, expiresInSeconds: maxAge });
}
