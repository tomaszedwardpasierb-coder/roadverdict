// Place at: src/app/api/admin/login-password/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword, createPendingTotp } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { password } = body as { password?: string };
  if (!password || !verifyAdminPassword(password)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const pendingToken = await createPendingTotp();
  const response = NextResponse.json({ ok: true });
  response.cookies.set("admin_pending", pendingToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 300,
    path: "/",
  });
  return response;
}
