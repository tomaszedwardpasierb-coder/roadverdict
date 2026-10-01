// Place at: src/app/api/auth/app/verify-2fa/route.ts
//
// The app's equivalent of totp/login-verify: the pending token arrives
// in the request body (the app has no cookie jar) instead of the
// totp_pending cookie, and the session comes back as a token instead of
// a cookie. Every check runs in the same order, for the same reasons -
// see login-verify's comments, especially why the pending login is
// checked before any code is looked at.
import { NextRequest, NextResponse } from "next/server";
import { decodeEmail } from "@/lib/auth/crypto";
import { isPendingLoginValid, consumePendingLogin, verifyLoginCode, checkTotpRateLimit, recordTotpAttempt } from "@/lib/auth/twoFactor";
import { createSessionForEmail } from "@/lib/auth/session";
import { getClientIp } from "@/lib/auth/signInRateLimit";
import { verifyTrustedDevice } from "@/lib/auth/trustedDevice";

export const dynamic = "force-dynamic";

const EXPIRED_MESSAGE = "That sign-in has expired - start again.";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { pendingToken, code, deviceId, secret } = (body ?? {}) as { pendingToken?: unknown; code?: unknown; deviceId?: unknown; secret?: unknown };
  if (typeof pendingToken !== "string") {
    return NextResponse.json({ error: EXPIRED_MESSAGE }, { status: 401 });
  }
  const [encodedEmail, rawToken] = pendingToken.split(".");
  if (!encodedEmail || !rawToken) {
    return NextResponse.json({ error: EXPIRED_MESSAGE }, { status: 401 });
  }
  const email = decodeEmail(encodedEmail);

  if (!(await isPendingLoginValid(email, rawToken))) {
    return NextResponse.json({ error: EXPIRED_MESSAGE }, { status: 401 });
  }

  if (!(await checkTotpRateLimit(email, "login"))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  // The second step is either an authenticator/backup code, or - from a
  // phone this account has trusted (see trustedDevice.ts) - that phone's
  // secret, which the app only sends after the phone's own fingerprint,
  // face or PIN check. Either way the emailed code came first.
  if (typeof deviceId === "string" && typeof secret === "string") {
    if (!(await verifyTrustedDevice(email, deviceId, secret))) {
      await recordTotpAttempt(email, "login");
      return NextResponse.json({ error: "This phone isn't trusted any more.", code: "device_not_trusted" }, { status: 401 });
    }
  } else {
    if (typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ error: "Enter your 6-digit code, or a backup code." }, { status: 400 });
    }
    if (!(await verifyLoginCode(email, code.trim()))) {
      await recordTotpAttempt(email, "login");
      return NextResponse.json({ error: "Incorrect code." }, { status: 401 });
    }
  }

  if (!(await consumePendingLogin(email, rawToken))) {
    return NextResponse.json({ error: EXPIRED_MESSAGE }, { status: 401 });
  }

  const { cookieValue, maxAge } = await createSessionForEmail(email, getClientIp(req), req.headers.get("user-agent") ?? "unknown", {
    client: "app",
  });
  return NextResponse.json({ token: cookieValue, expiresInSeconds: maxAge });
}
