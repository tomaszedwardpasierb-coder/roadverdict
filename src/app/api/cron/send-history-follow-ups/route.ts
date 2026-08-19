// Place at: src/app/api/cron/send-history-follow-ups/route.ts
//
// Runs daily (same cadence assumed as the other cron routes in this
// app), finds every shareable report link that's at least 4 weeks old,
// had a recipient email, and hasn't been followed up yet, and sends
// the "bought the bike? take its history with you" email - unless the
// bike's already been requested or handed off by then, in which case
// it's marked processed without sending, so it isn't re-checked forever.
import { NextRequest, NextResponse } from "next/server";
import { getShareLinksNeedingFollowUp, markShareLinkFollowUpSent } from "@/lib/tracker/shareLink";
import { getBike, isBikeReadOnly } from "@/lib/tracker/bike";
import { hasActiveTransferRequestForBike } from "@/lib/tracker/bikeTransferRequest";
import { sendHistoryFollowUpEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  const candidates = await getShareLinksNeedingFollowUp();
  let checked = 0;
  let sent = 0;
  let skipped = 0;

  for (const link of candidates) {
    checked++;
    if (!link.recipientEmail) {
      // Shouldn't happen given the query's own IS_DEFINED filter, but
      // there's nowhere to send this without an address regardless.
      skipped++;
      continue;
    }

    const bike = await getBike(link.email, link.bikeId);
    if (!bike) {
      // Bike deleted since the link was created - nothing left to
      // offer a history for. Mark processed so this link stops
      // showing up in every future run.
      await markShareLinkFollowUpSent(link.id);
      skipped++;
      continue;
    }

    if (isBikeReadOnly(bike) || (await hasActiveTransferRequestForBike(link.email, link.bikeId))) {
      // Already handed off, or already requested by someone - either
      // way the follow-up would be redundant or actively unwelcome.
      await markShareLinkFollowUpSent(link.id);
      skipped++;
      continue;
    }

    try {
      await sendHistoryFollowUpEmail({
        recipientEmail: link.recipientEmail,
        bikeSummary: { make: bike.make, model: bike.model, year: bike.year, isCustomBuild: !!bike.isCustomBuild },
        reportUrl: `${appUrl}/report/${link.id}`,
      });
      await markShareLinkFollowUpSent(link.id);
      sent++;
    } catch (err) {
      // Not marked as sent on failure - left eligible so tomorrow's
      // run retries it, same as a transient failure anywhere else in
      // this app degrading to "try again next time" rather than lost.
      console.error("History follow-up email failed to send:", err);
    }
  }

  return NextResponse.json({ checked, sent, skipped });
}
