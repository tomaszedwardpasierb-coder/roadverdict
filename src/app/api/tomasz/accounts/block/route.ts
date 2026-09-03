// Place at: src/app/api/tomasz/accounts/block/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { blockAccount, unblockAccount } from "@/lib/tracker/userAccount";

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
  const { email, blocked } = body as { email?: string; blocked?: boolean };
  if (!email || !email.trim()) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  const targetEmail = email.trim().toLowerCase();

  try {
    if (blocked) {
      await blockAccount(targetEmail);
    } else {
      await unblockAccount(targetEmail);
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not update this account." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
