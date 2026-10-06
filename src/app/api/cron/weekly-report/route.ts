// Place at: src/app/api/cron/weekly-report/route.ts
//
// The Monday report (see analytics/weeklyReport.ts): last week's numbers in
// one email to the site owner. Meant to run every Monday morning; also
// runnable from /tomasz ("Send now"). The address comes from the
// WEEKLY_REPORT_TO setting rather than the code, since the repo is public.
import { NextRequest, NextResponse } from "next/server";
import { withCronRun } from "@/lib/admin/cronRuns";
import { buildWeeklyReport, gatherWeeklyReport } from "@/lib/analytics/weeklyReport";
import { getAllUserAccounts } from "@/lib/tracker/userAccount";
import { sendWeeklyReportEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const to = process.env.WEEKLY_REPORT_TO?.trim();
  if (!to) {
    return NextResponse.json({ ok: false, sent: false, reason: "WEEKLY_REPORT_TO isn't set." });
  }

  try {
    const accounts = (await getAllUserAccounts()).map((u) => ({ email: u.email, createdAt: u.createdAt }));
    const report = buildWeeklyReport(await gatherWeeklyReport(accounts));
    await sendWeeklyReportEmail(to, report);
    return NextResponse.json({ ok: true, sent: true, subject: report.subject });
  } catch (err) {
    console.error("Weekly report failed:", err);
    return NextResponse.json({ error: "Couldn't build or send the report." }, { status: 500 });
  }
}

// Records "last run" for /tomasz (see admin/cronRuns.ts).
export const POST = withCronRun("weekly-report", handle);
