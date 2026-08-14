// Place at: src/app/api/tomasz/impersonate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { createSessionForEmail } from "@/lib/auth/session";
import { userExists, logImpersonation } from "@/lib/admin/impersonation";

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
  const { email } = body as { email?: string };
  if (!email || !email.trim()) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  const targetEmail = email.trim().toLowerCase();

  const exists = await userExists(targetEmail);
  if (!exists) {
    return NextResponse.json({ error: "No account found for that email." }, { status: 404 });
  }

  const ip = getClientIp(request);
  await logImpersonation(targetEmail, ip, "start");

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

  return response;
}

export async function DELETE(request: NextRequest) {
  // Deliberately doesn't require a currently-valid admin session to exit -
  // exiting is always the safe direction, and someone whose admin session
  // happened to expire mid-impersonation shouldn't be stuck unable to
  // leave it.
  const targetEmail = request.cookies.get("impersonating_as")?.value;
  if (targetEmail) {
    await logImpersonation(targetEmail, getClientIp(request), "end");
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

  return response;
}
