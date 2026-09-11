// Place at: src/app/api/cron/purge-orphaned-receipt-requests/route.ts
import { NextRequest, NextResponse } from "next/server";
import { purgeOrphanedReceiptRequests } from "@/lib/tracker/receiptRequest";
import { purgeOrphanedCarReceiptRequests } from "@/lib/tracker/carReceiptRequest";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // One combined count across both vehicle kinds, same pattern as
    // this app's other cron routes (check-reminders, audit-mileage).
    const [bikeDeletedCount, carDeletedCount] = await Promise.all([purgeOrphanedReceiptRequests(), purgeOrphanedCarReceiptRequests()]);
    return NextResponse.json({ ok: true, deletedCount: bikeDeletedCount + carDeletedCount, bikeDeletedCount, carDeletedCount });
  } catch (err) {
    return NextResponse.json(
      { error: "Unexpected error purging orphaned receipt requests", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
