// Place at: src/app/api/tracker/receipt-request/[requestId]/decide/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { decideReceiptRequestItems } from "@/lib/tracker/receiptRequest";

export const dynamic = "force-dynamic";

// Deliberately simpler than the email flow's decide route - no confirm
// page, applies immediately. That's safe here specifically because this
// is a genuine POST from a button click inside an authenticated
// session, not a GET link sitting in an email that a security scanner
// could visit on the owner's behalf before they ever see it.
export async function POST(req: NextRequest, { params }: { params: { requestId: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { entryIds?: string[] | "all"; decision?: "approved" | "declined" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.decision || (body.decision !== "approved" && body.decision !== "declined")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const updated = await decideReceiptRequestItems(params.requestId, session.email, body.entryIds ?? "all", body.decision);
  if (!updated) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, items: updated.items });
}
