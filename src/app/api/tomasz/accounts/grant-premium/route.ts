// Place at: src/app/api/tomasz/accounts/grant-premium/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { grantPremium } from "@/lib/tracker/userAccount";

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
  const { email, expiresAt } = body as { email?: string; expiresAt?: string };
  if (!email || !email.trim()) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  if (!expiresAt || typeof expiresAt !== "string") {
    return NextResponse.json({ error: "An expiry date is required." }, { status: 400 });
  }
  const targetEmail = email.trim().toLowerCase();

  // grantPremium() enforces the 3-year cap and the "must be in the
  // future" rule itself - never trust the client's own date-input max
  // attribute as the real boundary.
  try {
    await grantPremium(targetEmail, expiresAt);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not grant Premium." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
