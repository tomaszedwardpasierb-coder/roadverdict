// Place at: src/app/api/tracker/bills/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createBill } from "@/lib/tracker/bill";

export const dynamic = "force-dynamic";

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

  const { billType, cost, date, notes } = body as {
    billType?: string;
    cost?: number;
    date?: string;
    notes?: string;
  };

  if (!billType || cost == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  const bill = await createBill(session.email, { billType, cost, date, notes: notes ?? "" });
  return NextResponse.json({ bill });
}
