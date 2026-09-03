// Place at: src/app/api/tomasz/accounts/revoke-premium/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { revokePremium } from "@/lib/tracker/userAccount";

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
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { email } = body as { email?: string };
  if (!email || !email.trim()) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  const targetEmail = email.trim().toLowerCase();

  try {
    await revokePremium(targetEmail);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not revoke Premium." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
