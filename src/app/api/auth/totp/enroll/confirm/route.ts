// Place at: src/app/api/auth/totp/enroll/confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { confirmEnrollment, checkTotpRateLimit, recordTotpAttempt } from "@/lib/auth/twoFactor";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const allowed = await checkTotpRateLimit(session.email, "enroll");
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
    return NextResponse.json({ error: "Enter the 6-digit code from your authenticator app." }, { status: 400 });
  }

  const result = await confirmEnrollment(session.email, code);
  if (!result.ok) {
    await recordTotpAttempt(session.email, "enroll");
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ backupCodes: result.backupCodes });
}
