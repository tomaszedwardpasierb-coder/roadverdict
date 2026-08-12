import { NextRequest, NextResponse } from "next/server";
import { getSiteStats } from "@/lib/monitoring/appInsights";
import { getAdminSession } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const hours = Math.min(
    Math.max(Number(request.nextUrl.searchParams.get("hours")) || 24, 1),
    168
  );

  try {
    const stats = await getSiteStats(hours);
    return NextResponse.json(stats);
  } catch (err) {
    console.error("site-stats query failed:", err);
    // TEMPORARY - remove `detail` once this is confirmed working. Route is
    // admin-gated so this isn't a public leak, but no reason to keep
    // exposing internals longer than needed for debugging.
    return NextResponse.json(
      {
        error: "Failed to load site stats.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }
}
