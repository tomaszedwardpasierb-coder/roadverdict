// Place at: src/app/api/cron/purge-orphaned-receipt-requests/route.ts
import { NextRequest, NextResponse } from "next/server";
import { purgeOrphanedReceiptRequests } from "@/lib/tracker/receiptRequest";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const deletedCount = await purgeOrphanedReceiptRequests();
    return NextResponse.json({ ok: true, deletedCount });
  } catch (err) {
    return NextResponse.json(
      { error: "Unexpected error purging orphaned receipt requests", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
