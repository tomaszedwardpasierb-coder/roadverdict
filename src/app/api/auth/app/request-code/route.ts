// Place at: src/app/api/auth/app/request-code/route.ts
//
// Step one of signing in to the Android app: email a 6-digit code. Mirrors
// request-link's checks and replies, minus the demo bypass - the app
// has no demo account, and the demo address gets the same "check your
// email" reply as any other address, without a code being created.
import { NextRequest, NextResponse } from "next/server";
import { isAccountBlocked } from "@/lib/tracker/userDoc";
import { getClientIp, isIpRateLimited, recordIpAttempt } from "@/lib/auth/signInRateLimit";
import { createAppLoginCode, isAppCodeRequestCoolingDown } from "@/lib/auth/appLoginCode";
import { sendAppLoginCodeEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

const DEMO_EMAIL = "demo@roadverdict.co.uk";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  const { email } = (body ?? {}) as { email?: unknown };
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  const normalizedEmail = email.toLowerCase().trim();

  if (await isAccountBlocked(normalizedEmail)) {
    return NextResponse.json({ error: "This account is no longer able to sign in." }, { status: 403 });
  }

  const ip = getClientIp(req);
  if (await isIpRateLimited(ip)) {
    return NextResponse.json({ error: "Too many attempts. Please wait and try again." }, { status: 429 });
  }
  await recordIpAttempt(ip);

  if (await isAppCodeRequestCoolingDown(normalizedEmail)) {
    return NextResponse.json({ error: "Please wait a moment before requesting another code" }, { status: 429 });
  }

  if (normalizedEmail === DEMO_EMAIL) {
    return NextResponse.json({ ok: true });
  }

  const code = await createAppLoginCode(normalizedEmail);
  await sendAppLoginCodeEmail(normalizedEmail, code);

  return NextResponse.json({ ok: true });
}
