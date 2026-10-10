// Place at: src/app/api/auth/google/start/route.ts
//
// "Continue with Google" on the website, leg one: remember this attempt in
// a short-lived cookie and send the visitor to Google. Leg two is
// ../callback. See lib/auth/googleSignIn.ts.
import { NextRequest, NextResponse } from "next/server";
import { getSafeRedirectPath } from "@/lib/auth/safeRedirect";
import { toFunnelSource } from "@/lib/analytics/funnel";
import { encodeAttempt, googleAuthUrl, googleRedirectUri, googleWebSignInEnabled, newGoogleAttempt, GOOGLE_ATTEMPT_COOKIE } from "@/lib/auth/googleSignIn";

export const dynamic = "force-dynamic";

const APP_URL = process.env.APP_URL ?? "https://roadverdict.co.uk";
const ATTEMPT_MAX_AGE_SECONDS = 10 * 60;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (!googleWebSignInEnabled()) return NextResponse.redirect(`${APP_URL}/login`);

  const redirect = getSafeRedirectPath(url.searchParams.get("redirect"));
  const src = toFunnelSource(url.searchParams.get("src"));
  const attempt = newGoogleAttempt(redirect, src);

  const response = NextResponse.redirect(googleAuthUrl(attempt, googleRedirectUri(APP_URL)));
  response.cookies.set(GOOGLE_ATTEMPT_COOKIE, encodeAttempt(attempt), {
    httpOnly: true,
    secure: true,
    // Lax still sends it on Google's top-level redirect back to us.
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: ATTEMPT_MAX_AGE_SECONDS,
  });
  return response;
}
