// Place at: src/app/api/cron/indexnow/route.ts
//
// Tells IndexNow (Bing and friends) about sitemap pages that are new or
// whose lastModified date moved since the last run - see seo/indexNow.ts.
// Runs daily from the scheduler; also "Run now" in /tomasz. A day with no
// changes sends nothing.
import { NextRequest, NextResponse } from "next/server";
import { withCronRun } from "@/lib/admin/cronRuns";
import sitemap from "@/app/sitemap";
import { submitChangedPages } from "@/lib/seo/indexNow";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pages = sitemap().map((e) => ({
      url: e.url,
      lastModified: (e.lastModified instanceof Date ? e.lastModified : new Date(e.lastModified ?? 0)).toISOString().slice(0, 10),
    }));
    const result = await submitChangedPages(pages);
    return NextResponse.json({ ok: result.status === null || result.status === 200 || result.status === 202, ...result });
  } catch (err) {
    console.error("IndexNow submission failed:", err);
    return NextResponse.json({ error: "IndexNow submission failed." }, { status: 500 });
  }
}

// Records "last run" for /tomasz (see admin/cronRuns.ts).
export const POST = withCronRun("indexnow", handle);
