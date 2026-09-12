// Place at: src/app/api/admin/run-cron/[name]/route.ts
//
// Runs a cron job's own POST handler directly, in-process - NOT via a
// real HTTP fetch back to this app's own public URL, which is what this
// route used to do. That self-fetch was a real bug: it made this
// request depend on a second request to the same app being able to run
// concurrently and complete, which on a deployment with limited worker
// concurrency can deadlock (this request occupies the only available
// worker while waiting on a second request that needs a worker to even
// start) - the admin sees "Running…" that never clears, even though
// nothing is actually still working. Calling the handler directly turns
// this into a single, ordinary in-process function call with no network
// round-trip and no concurrency dependency at all.
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { POST as updateFuelPrice } from "@/app/api/cron/update-fuel-price/route";
import { POST as checkReminders } from "@/app/api/cron/check-reminders/route";
import { POST as backfillBikeId } from "@/app/api/cron/backfill-bike-id/route";
import { POST as deleteExpiredShareLinks } from "@/app/api/cron/delete-expired-share-links/route";
import { POST as auditMileage } from "@/app/api/cron/audit-mileage/route";
import { POST as purgeOrphanedReceiptRequests } from "@/app/api/cron/purge-orphaned-receipt-requests/route";
import { POST as updateExchangeRates } from "@/app/api/cron/update-exchange-rates/route";
import { POST as sendHistoryFollowUps } from "@/app/api/cron/send-history-follow-ups/route";
import { POST as backfillUsers } from "@/app/api/cron/backfill-users/route";
import { POST as seedAssistantConfig } from "@/app/api/cron/seed-assistant-config/route";
import { POST as purgeStaleData } from "@/app/api/cron/purge-stale-data/route";

export const dynamic = "force-dynamic";

// Every cron route itself re-checks this same CRON_SECRET bearer token
// (see e.g. check-reminders/route.ts) - unchanged by this fix, since
// each handler is called exactly as it would be over real HTTP, just
// without the network hop.
const CRON_HANDLERS: Record<string, (req: NextRequest) => Promise<Response>> = {
  "update-fuel-price": updateFuelPrice,
  "check-reminders": checkReminders,
  "backfill-bike-id": backfillBikeId,
  "delete-expired-share-links": deleteExpiredShareLinks,
  "audit-mileage": auditMileage,
  "purge-orphaned-receipt-requests": purgeOrphanedReceiptRequests,
  "update-exchange-rates": updateExchangeRates,
  "send-history-follow-ups": sendHistoryFollowUps,
  "backfill-users": backfillUsers,
  "seed-assistant-config": seedAssistantConfig,
  "purge-stale-data": purgeStaleData,
};

export async function POST(request: Request, props: { params: Promise<{ name: string }> }) {
  const params = await props.params;
  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const handler = CRON_HANDLERS[params.name];
  if (!handler) {
    return NextResponse.json({ error: "Unknown cron." }, { status: 400 });
  }

  const cronRequest = new NextRequest(`http://internal/api/cron/${params.name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const res = await handler(cronRequest);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
