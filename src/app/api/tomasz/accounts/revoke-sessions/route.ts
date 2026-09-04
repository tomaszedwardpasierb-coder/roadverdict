// Place at: src/app/api/tomasz/accounts/revoke-sessions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { revokeAllSessions } from "@/lib/tracker/userAccount";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Not signed in as admin." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { email } = body as { email?: string };
  if (!email) {
    return NextResponse.json({ error: "Missing email." }, { status: 400 });
  }

  try {
    const revokedCount = await revokeAllSessions(email);
    return NextResponse.json({ ok: true, revokedCount });
  } catch (err) {
    console.error("Failed to revoke sessions:", err);
    return NextResponse.json({ error: "Could not revoke sessions." }, { status: 500 });
  }
}
