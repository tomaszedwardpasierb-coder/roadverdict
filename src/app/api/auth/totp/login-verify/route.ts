// Place at: src/app/api/auth/totp/login-verify/route.ts
//
// The second step of signing in for an account with 2FA on - reached
// only after verify/route.ts has already independently confirmed a real
// magic-link click and issued the totp_pending cookie below, never
// reachable on its own. code here is always checked against the account
// the pending cookie names, never one the request body could supply -
// same "identity comes from a server-issued token, not client input"
// principle as every session check elsewhere in this app.
import { NextRequest, NextResponse } from "next/server";
import { decodeEmail } from "@/lib/auth/crypto";
import { consumePendingLogin, verifyLoginCode, checkTotpRateLimit, recordTotpAttempt } from "@/lib/auth/twoFactor";
import { createSessionForEmail } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

export async function POST(request: NextRequest) {
  const pendingCookie = request.cookies.get("totp_pending")?.value;
  if (!pendingCookie) {
    return NextResponse.json({ error: "That link has expired - sign in again." }, { status: 401 });
  }
  const [encodedEmail, rawToken] = pendingCookie.split(".");
  if (!encodedEmail || !rawToken) {
    return NextResponse.json({ error: "That link has expired - sign in again." }, { status: 401 });
  }
  const email = decodeEmail(encodedEmail);

  const allowed = await checkTotpRateLimit(email, "login");
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

  const codeValid = await verifyLoginCode(email, code);
  if (!codeValid) {
    // Deliberately does NOT burn the pending login on a wrong guess,
    // unlike the admin panel's own equivalent step - the rate limit
    // above (10 attempts per 15 minutes, against a 1-in-a-million code
    // space) already makes brute force impractical without also
    // punishing an ordinary typo by forcing a fresh magic-link request.
    await recordTotpAttempt(email, "login");
    return NextResponse.json({ error: "Incorrect code." }, { status: 401 });
  }

  const pendingValid = await consumePendingLogin(email, rawToken);
  if (!pendingValid) {
    return NextResponse.json({ error: "That link has expired - sign in again." }, { status: 401 });
  }

  const { cookieValue, maxAge } = await createSessionForEmail(email, getClientIp(request), request.headers.get("user-agent") ?? "unknown");
  const response = NextResponse.json({ ok: true });
  response.cookies.set("session", cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  response.cookies.delete("totp_pending");
  return response;
}
