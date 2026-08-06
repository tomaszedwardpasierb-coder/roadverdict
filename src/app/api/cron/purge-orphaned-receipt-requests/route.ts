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

  const deletedCount = await purgeOrphanedReceiptRequests();
  return NextResponse.json({ ok: true, deletedCount });
}
