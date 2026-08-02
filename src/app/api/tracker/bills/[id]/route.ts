// Place at: src/app/api/tracker/bills/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateBill, deleteBill } from "@/lib/tracker/bill";
import type { Attachment } from "@/lib/tracker/cosmosHelpers";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::bill::`)) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { billType, cost, date, notes, attachments } = body as {
    billType?: string;
    cost?: number;
    date?: string;
    notes?: string;
    attachments?: Attachment[];
  };

  if (!billType || cost == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  const bill = await updateBill(session.email, id, { billType, cost, date, notes: notes ?? "", attachments });
  if (!bill) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  return NextResponse.json({ bill });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::bill::`)) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  await deleteBill(session.email, id);
  return NextResponse.json({ ok: true });
}
