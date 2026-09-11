// Place at: src/app/api/cron/send-history-follow-ups/route.ts
//
// Runs daily (same cadence assumed as the other cron routes in this
// app), finds every shareable report link that's at least 4 weeks old,
// had a recipient email, and hasn't been followed up yet, and sends
// the "bought the vehicle? take its history with you" email - unless
// the vehicle's already been requested or handed off by then, in which
// case it's marked processed without sending, so it isn't re-checked
// forever. A second loop over car share links, mirroring the bike loop
// exactly - same pattern check-reminders/audit-mileage already
// establish for this app's other cron routes (one combined run, one
// combined set of totals, not two separately-tracked cron jobs).
import { NextRequest, NextResponse } from "next/server";
import { getShareLinksNeedingFollowUp, markShareLinkFollowUpSent } from "@/lib/tracker/shareLink";
import { getCarShareLinksNeedingFollowUp, markCarShareLinkFollowUpSent } from "@/lib/tracker/carShareLink";
import { getBike, isBikeReadOnly } from "@/lib/tracker/bike";
import { getCarById, isCarReadOnly } from "@/lib/tracker/car";
import { hasActiveTransferRequestForBike } from "@/lib/tracker/bikeTransferRequest";
import { hasActiveCarTransferRequestForCar } from "@/lib/tracker/carTransferRequest";
import { sendHistoryFollowUpEmail, sendCarHistoryFollowUpEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  let checked = 0;
  let sent = 0;
  let skipped = 0;

  const bikeCandidates = await getShareLinksNeedingFollowUp();
  for (const link of bikeCandidates) {
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
        reportUrl: `${appUrl}/report/${link.id}/detailed`,
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

  const carCandidates = await getCarShareLinksNeedingFollowUp();
  for (const link of carCandidates) {
    checked++;
    if (!link.recipientEmail) {
      skipped++;
      continue;
    }

    const car = await getCarById(link.email, link.carId);
    if (!car) {
      await markCarShareLinkFollowUpSent(link.id);
      skipped++;
      continue;
    }

    if (isCarReadOnly(car) || (await hasActiveCarTransferRequestForCar(link.email, link.carId))) {
      await markCarShareLinkFollowUpSent(link.id);
      skipped++;
      continue;
    }

    try {
      await sendCarHistoryFollowUpEmail({
        recipientEmail: link.recipientEmail,
        carSummary: { make: car.make, model: car.model, year: car.year, isCustomBuild: !!car.isCustomBuild },
        reportUrl: `${appUrl}/car-report/${link.id}/detailed`,
      });
      await markCarShareLinkFollowUpSent(link.id);
      sent++;
    } catch (err) {
      console.error("Car history follow-up email failed to send:", err);
    }
  }

  return NextResponse.json({ checked, sent, skipped });
}
