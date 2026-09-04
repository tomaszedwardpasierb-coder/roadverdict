// Place at: src/app/api/admin/login-totp/route.ts
import { NextRequest, NextResponse } from "next/server";
import { consumePendingTotp, createAdminSession, invalidatePendingTotp, checkAdminLoginRateLimit, recordAdminLoginAttempt } from "@/lib/admin/session";
import { verifyTotpCode } from "@/lib/admin/totp";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const pendingToken = request.cookies.get("admin_pending")?.value;
  if (!pendingToken) {
    return NextResponse.json({ error: "Session expired. Enter your password again." }, { status: 401 });
  }

  const { allowed } = await checkAdminLoginRateLimit("totp");
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
  if (!code || !verifyTotpCode(code)) {
    await recordAdminLoginAttempt("totp");
    // Burns the pending token too - a wrong guess should cost the
    // attacker having to re-prove the password, not just a strike
    // against the count above.
    await invalidatePendingTotp(pendingToken);
    return NextResponse.json({ error: "Incorrect code." }, { status: 401 });
  }

  const pendingValid = await consumePendingTotp(pendingToken);
  if (!pendingValid) {
    return NextResponse.json({ error: "Session expired. Enter your password again." }, { status: 401 });
  }

  const sessionToken = await createAdminSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set("admin_session", sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 12 * 60 * 60,
    path: "/",
  });
  response.cookies.delete("admin_pending");
  return response;
}
