// Place at: src/app/api/tomasz/accounts/delete/route.ts
//
// The one irreversible action in this whole admin panel - deletes the
// account and everything tied to its email (see userAccount.ts's
// deleteAccount() for the full cascade). Requires confirmEmail to
// exactly match email, not just a truthy flag - defense in depth
// matching DeleteAccountButton.tsx's own typed-email confirmation
// client-side, so a forged or replayed request can't skip that step.
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { deleteAccount } from "@/lib/tracker/userAccount";

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
  const { email, confirmEmail } = body as { email?: string; confirmEmail?: string };
  if (!email || !email.trim()) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  const targetEmail = email.trim().toLowerCase();

  if (typeof confirmEmail !== "string" || confirmEmail.trim().toLowerCase() !== targetEmail) {
    return NextResponse.json({ error: "Confirmation email doesn't match." }, { status: 400 });
  }

  try {
    await deleteAccount(targetEmail);
  } catch (err) {
    console.error(`Failed to delete account ${targetEmail}:`, err);
    return NextResponse.json({ error: "Something went wrong deleting this account. Check the logs before retrying." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
