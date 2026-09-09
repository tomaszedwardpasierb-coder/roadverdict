// Place at: src/app/api/tomasz/impersonate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, verifyAdminPassword, checkAdminLoginRateLimit, recordAdminLoginAttempt } from "@/lib/admin/session";
import { verifyTotpCode } from "@/lib/admin/totp";
import { createSessionForEmail } from "@/lib/auth/session";
import { userExists, logImpersonation, newImpersonationSessionId } from "@/lib/admin/impersonation";

export const dynamic = "force-dynamic";

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

export async function POST(request: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Not signed in as admin." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { email, password, totpCode, reason } = body as {
    email?: string;
    password?: string;
    totpCode?: string;
    reason?: string;
  };
  if (!email || !email.trim()) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  const trimmedReason = reason?.trim();
  if (!trimmedReason) {
    return NextResponse.json({ error: "Please give a reason for this impersonation." }, { status: 400 });
  }

  // Step-up re-auth: an already-valid admin session alone is no longer
  // enough to start impersonating - the admin must re-prove their
  // identity right now, the same way logging in the first time does
  // (see login-password/login-totp routes), just without the pending-
  // TOTP cookie dance those need for establishing a brand-new session -
  // this is one already-authenticated admin re-proving themselves, not
  // a fresh login. Password checked before TOTP, same order as login,
  // so a wrong password never gets a "your code was fine" signal either.
  const passwordLimit = await checkAdminLoginRateLimit("reauth-password");
  if (!passwordLimit.allowed) {
    return NextResponse.json({ error: "Too many attempts. Please wait and try again." }, { status: 429 });
  }
  await recordAdminLoginAttempt("reauth-password");
  if (!password || !verifyAdminPassword(password)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const totpLimit = await checkAdminLoginRateLimit("reauth-totp");
  if (!totpLimit.allowed) {
    return NextResponse.json({ error: "Too many attempts. Please wait and try again." }, { status: 429 });
  }
  await recordAdminLoginAttempt("reauth-totp");
  if (!totpCode || !verifyTotpCode(totpCode)) {
    return NextResponse.json({ error: "Incorrect authenticator code." }, { status: 401 });
  }

  const targetEmail = email.trim().toLowerCase();

  const exists = await userExists(targetEmail);
  if (!exists) {
    return NextResponse.json({ error: "No account found for that email." }, { status: 404 });
  }

  const ip = getClientIp(request);
  const sessionId = newImpersonationSessionId();
  await logImpersonation(targetEmail, ip, "start", sessionId, trimmedReason);

  const { cookieValue, maxAge } = await createSessionForEmail(
    targetEmail,
    ip,
    request.headers.get("user-agent") ?? "unknown"
  );

  const response = NextResponse.json({ ok: true });

  // Preserve whatever session cookie was already there - most likely the
  // admin's own regular account, if they have one - so exiting can
  // restore it rather than just losing it.
  const priorSession = request.cookies.get("session")?.value;
  if (priorSession) {
    response.cookies.set("admin_prior_session", priorSession, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  }

  response.cookies.set("session", cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  response.cookies.set("impersonating_as", targetEmail, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  // Separate from impersonating_as (still a plain email, unchanged -
  // see layout.tsx's own read of it) so this can carry just the
  // correlation id every impersonationActivity entry gets tagged with,
  // without touching the existing cookie's format or its other readers.
  response.cookies.set("impersonation_session_id", sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });

  return response;
}

export async function DELETE(request: NextRequest) {
  // Deliberately doesn't require a currently-valid admin session to exit -
  // exiting is always the safe direction, and someone whose admin session
  // happened to expire mid-impersonation shouldn't be stuck unable to
  // leave it.
  const targetEmail = request.cookies.get("impersonating_as")?.value;
  const sessionId = request.cookies.get("impersonation_session_id")?.value;
  if (targetEmail && sessionId) {
    await logImpersonation(targetEmail, getClientIp(request), "end", sessionId);
  }

  const response = NextResponse.json({ ok: true });
  const priorSession = request.cookies.get("admin_prior_session")?.value;
  if (priorSession) {
    response.cookies.set("session", priorSession, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
  } else {
    response.cookies.delete("session");
  }
  response.cookies.delete("impersonating_as");
  response.cookies.delete("admin_prior_session");
  response.cookies.delete("impersonation_session_id");

  return response;
}
