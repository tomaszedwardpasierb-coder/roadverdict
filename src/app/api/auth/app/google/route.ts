// Place at: src/app/api/auth/app/google/route.ts
//
// "Continue with Google" in the Android app. The phone's own Google
// sign-in hands the app an ID token (issued for our web client id); the
// app posts it here and gets back exactly what verify-code returns - a
// session token, or a pending token when the account has 2FA on.
//
// GET tells the app whether Google sign-in is switched on and which client
// id to ask Google for, so the button appears once the server is set up,
// without a new app build.
import { NextRequest, NextResponse } from "next/server";
import { isAccountBlocked } from "@/lib/tracker/userDoc";
import { getClientIp } from "@/lib/auth/signInRateLimit";
import { isTwoFactorEnabled, createPendingLogin } from "@/lib/auth/twoFactor";
import { createSessionForEmail } from "@/lib/auth/session";
import { googleAppSignInEnabled, googleClientId, verifyGoogleIdToken } from "@/lib/auth/googleSignIn";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ webClientId: googleAppSignInEnabled() ? googleClientId() : null });
}

export async function POST(req: NextRequest) {
  if (!googleAppSignInEnabled()) {
    return NextResponse.json({ error: "Google sign-in isn't available. Use your email instead." }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { idToken } = (body ?? {}) as { idToken?: unknown };
  if (typeof idToken !== "string" || idToken.length > 8192) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = await verifyGoogleIdToken(idToken);
  if (!email) {
    return NextResponse.json({ error: "Google sign-in didn't work. Try again, or use your email instead." }, { status: 401 });
  }
  if (await isAccountBlocked(email)) {
    return NextResponse.json({ error: "This account is no longer able to sign in." }, { status: 403 });
  }

  if (await isTwoFactorEnabled(email)) {
    const { cookieValue, maxAge } = await createPendingLogin(email);
    return NextResponse.json({ twoFactorRequired: true, pendingToken: cookieValue, expiresInSeconds: maxAge });
  }

  const { cookieValue, maxAge } = await createSessionForEmail(email, getClientIp(req), req.headers.get("user-agent") ?? "unknown", { client: "app" });
  return NextResponse.json({ token: cookieValue, expiresInSeconds: maxAge });
}
