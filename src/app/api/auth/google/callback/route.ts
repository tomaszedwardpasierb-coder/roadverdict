// Place at: src/app/api/auth/google/callback/route.ts
//
// "Continue with Google" on the website, leg two: Google sends the visitor
// back with a code. Check it belongs to the attempt in our cookie, swap it
// for an ID token, take the verified email from it, and finish exactly the
// way a magic-link click does (verify/route.ts): blocked accounts refused,
// 2FA asked for when it's on, otherwise a session.
import { NextRequest, NextResponse } from "next/server";
import { recordFunnelStep, toFunnelSource, isInAppBrowser } from "@/lib/analytics/funnel";
import { createSessionForEmail } from "@/lib/auth/session";
import { getSafeRedirectPath } from "@/lib/auth/safeRedirect";
import { getClientIp } from "@/lib/auth/signInRateLimit";
import { isTwoFactorEnabled, createPendingLogin } from "@/lib/auth/twoFactor";
import { isAccountBlocked } from "@/lib/tracker/userDoc";
import { decodeAttempt, exchangeCode, googleRedirectUri, verifyGoogleIdToken, GOOGLE_ATTEMPT_COOKIE } from "@/lib/auth/googleSignIn";

export const dynamic = "force-dynamic";

const APP_URL = process.env.APP_URL ?? "https://roadverdict.co.uk";

function backToLogin(redirect: string | null, error: string | null): NextResponse {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  if (redirect) params.set("redirect", redirect);
  const query = params.toString();
  const response = NextResponse.redirect(`${APP_URL}/login${query ? `?${query}` : ""}`);
  response.cookies.delete({ name: GOOGLE_ATTEMPT_COOKIE, path: "/api/auth/google" });
  return response;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const attempt = decodeAttempt(req.cookies.get(GOOGLE_ATTEMPT_COOKIE)?.value);
  const redirect = getSafeRedirectPath(attempt?.redirect ?? null);

  // Cancelled on Google's screen: back to the sign-in page, no error.
  if (url.searchParams.get("error")) return backToLogin(redirect, null);

  const code = url.searchParams.get("code");
  if (!attempt || !code || url.searchParams.get("state") !== attempt.state) return backToLogin(redirect, "google_failed");

  const idToken = await exchangeCode(code, attempt.verifier, googleRedirectUri(APP_URL));
  const email = idToken ? await verifyGoogleIdToken(idToken, { nonce: attempt.nonce }) : null;
  if (!email) return backToLogin(redirect, "google_failed");

  if (await isAccountBlocked(email)) return backToLogin(null, "blocked");

  const source = toFunnelSource(attempt.src);
  void recordFunnelStep("signed_in", { source, inApp: isInAppBrowser(req.headers.get("user-agent")) });

  if (await isTwoFactorEnabled(email)) {
    const { cookieValue, maxAge } = await createPendingLogin(email);
    const redirectParam = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
    const response = NextResponse.redirect(`${APP_URL}/login/verify-2fa${redirectParam}`);
    response.cookies.set("totp_pending", cookieValue, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge });
    response.cookies.delete({ name: GOOGLE_ATTEMPT_COOKIE, path: "/api/auth/google" });
    return response;
  }

  const { cookieValue, maxAge } = await createSessionForEmail(email, getClientIp(req), req.headers.get("user-agent") ?? "unknown", { source });
  const response = NextResponse.redirect(`${APP_URL}${redirect ?? "/dashboard"}`);
  response.cookies.set("session", cookieValue, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge });
  response.cookies.delete({ name: GOOGLE_ATTEMPT_COOKIE, path: "/api/auth/google" });
  return response;
}
