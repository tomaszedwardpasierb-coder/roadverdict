// Place at: src/app/api/account/request-deletion/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requestAccountDeletion } from "@/lib/tracker/userAccount";
import { sendAccountDeletionRequestedEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

// The typed-"DELETE" gate the modal enforces client-side is re-checked
// here - a client-side-only check is just UI friction, not a real
// safeguard, since anyone could call this route directly.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { confirmText } = body as { confirmText?: string };
  if (confirmText !== "DELETE") {
    return NextResponse.json({ error: 'Please type "DELETE" to confirm.' }, { status: 400 });
  }

  const { deleteAfter } = await requestAccountDeletion(session.email);
  const deleteAfterLabel = new Date(deleteAfter).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  try {
    await sendAccountDeletionRequestedEmail(session.email, deleteAfterLabel);
  } catch (err) {
    // The deletion request itself already succeeded and is the thing
    // that actually matters - a failed confirmation email shouldn't
    // make this look like it failed when it didn't (same reasoning as
    // createReminderBestEffort in commitReceiptItem.ts).
    console.error("request-deletion: confirmation email failed to send, request itself still succeeded:", err);
  }

  return NextResponse.json({ deleteAfter, deleteAfterLabel });
}
