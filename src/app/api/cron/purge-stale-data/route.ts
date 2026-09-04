// Place at: src/app/api/cron/purge-stale-data/route.ts
//
// One combined periodic-maintenance sweep rather than five separate
// cron routes - unlike the other jobs in this directory (each a
// distinct, unrelated task), these five are all the same kind of
// thing: a doc type with no Cosmos ttl of its own that would otherwise
// grow forever. Bundling them keeps the external scheduler surface to
// one URL instead of five, while still reporting a per-type breakdown
// so nothing is opaque.
import { NextRequest, NextResponse } from "next/server";
import { purgeOldNotifications } from "@/lib/tracker/notification";
import { purgeStalePendingScanBatches } from "@/lib/tracker/pendingScanBatch";
import { pruneKnowledgeBaseVersions, prunePersonalityVersions } from "@/lib/tracker/assistantConfig";
import { purgeOldImpersonationLogs } from "@/lib/admin/impersonation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [notifications, pendingScanBatches, knowledgeBaseVersions, personalityVersions, impersonationLogs] = await Promise.all([
      purgeOldNotifications(),
      purgeStalePendingScanBatches(),
      pruneKnowledgeBaseVersions(),
      prunePersonalityVersions(),
      purgeOldImpersonationLogs(),
    ]);
    return NextResponse.json({
      ok: true,
      deletedCounts: { notifications, pendingScanBatches, knowledgeBaseVersions, personalityVersions, impersonationLogs },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Unexpected error purging stale data", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
