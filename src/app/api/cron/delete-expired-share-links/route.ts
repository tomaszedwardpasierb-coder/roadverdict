// Place at: src/app/api/cron/delete-expired-share-links/route.ts
import { NextRequest, NextResponse } from "next/server";
import { deleteExpiredShareLinks } from "@/lib/tracker/shareLink";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deletedCount = await deleteExpiredShareLinks();
  return NextResponse.json({ ok: true, deletedCount });
}
