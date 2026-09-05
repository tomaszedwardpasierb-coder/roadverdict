// Place at: src/app/api/auth/totp/enroll/start/route.ts
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getSession } from "@/lib/auth/session";
import { startEnrollment, checkTotpRateLimit, recordTotpAttempt, isTwoFactorEnabled } from "@/lib/auth/twoFactor";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const allowed = await checkTotpRateLimit(session.email, "enroll");
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  await recordTotpAttempt(session.email, "enroll");

  if (await isTwoFactorEnabled(session.email)) {
    return NextResponse.json({ error: "Two-factor authentication is already turned on." }, { status: 409 });
  }

  const { secret, otpauthUri } = await startEnrollment(session.email);
  // 150px wide, same size the report page's own QR code already uses
  // (see src/app/report/[token]/detailed/page.tsx) - small enough for an
  // inline settings card, still comfortably scannable.
  const qrDataUrl = await QRCode.toDataURL(otpauthUri, { margin: 1, width: 150 });

  return NextResponse.json({ qrDataUrl, manualEntryKey: secret });
}
