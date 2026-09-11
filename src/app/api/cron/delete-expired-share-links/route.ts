// Place at: src/app/api/cron/delete-expired-share-links/route.ts
import { NextRequest, NextResponse } from "next/server";
import { deleteExpiredShareLinks } from "@/lib/tracker/shareLink";
import { deleteExpiredCarShareLinks } from "@/lib/tracker/carShareLink";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // One combined count across both vehicle kinds - same "one cron
    // run, one set of totals" pattern this app's other cron routes
    // already use (check-reminders, audit-mileage), rather than two
    // separately-tracked jobs.
    const [bikeDeletedCount, carDeletedCount] = await Promise.all([deleteExpiredShareLinks(), deleteExpiredCarShareLinks()]);
    return NextResponse.json({ ok: true, deletedCount: bikeDeletedCount + carDeletedCount, bikeDeletedCount, carDeletedCount });
  } catch (err) {
    return NextResponse.json(
      { error: "Unexpected error deleting expired share links", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
