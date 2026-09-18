// Place at: src/app/api/cron/send-history-follow-ups/route.ts
//
// Runs daily (same cadence assumed as the other cron routes in this
// app), finds every shareable report link that's at least 4 weeks old,
// had a recipient email, and hasn't been followed up yet, and sends
// the "bought the vehicle? take its history with you" email - unless
// the vehicle's already been requested or handed off by then, in which
// case it's marked processed without sending, so it isn't re-checked
// forever. A second batch over car share links, mirroring the bike batch
// exactly - same pattern check-reminders/audit-mileage already
// establish for this app's other cron routes (one combined run, one
// combined set of totals, not two separately-tracked cron jobs).
import { NextRequest, NextResponse } from "next/server";
import { getShareLinksNeedingFollowUp, markShareLinkFollowUpSent, type ShareLinkDoc } from "@/lib/tracker/shareLink";
import { getCarShareLinksNeedingFollowUp, markCarShareLinkFollowUpSent, type CarShareLinkDoc } from "@/lib/tracker/carShareLink";
import { getBike, isBikeReadOnly } from "@/lib/tracker/bike";
import { getCarById, isCarReadOnly } from "@/lib/tracker/car";
import { hasActiveTransferRequestForBike } from "@/lib/tracker/bikeTransferRequest";
import { hasActiveCarTransferRequestForCar } from "@/lib/tracker/carTransferRequest";
import { sendHistoryFollowUpEmail, sendCarHistoryFollowUpEmail } from "@/lib/resend";
import { runInBatches } from "@/lib/concurrency";

export const dynamic = "force-dynamic";

// How many share links this checks/emails at once - was a plain
// sequential for-loop (one link's lookup/email/mark fully finished
// before the next one even started), so total run time scaled linearly
// with total pending-follow-up count with zero parallelism. Chunked via
// runInBatches rather than one big Promise.all over every candidate
// link, so concurrent Cosmos/Resend load stays bounded as that count
// grows.
const CRON_BATCH_SIZE = 20;

type FollowUpOutcome = "sent" | "skipped" | "failed";

// Isolated per link, same as check-reminders/audit-mileage - one
// transient Cosmos read/write failure for a single link shouldn't abort
// every other link's own chance to be checked in this run. Caught here
// rather than left to reject, so a failure surfaces as a FollowUpOutcome
// the caller can count without runInBatches' Promise.allSettled ever
// actually seeing a rejection.
async function processBikeShareLink(link: ShareLinkDoc, appUrl: string): Promise<FollowUpOutcome> {
  try {
    if (!link.recipientEmail) {
      // Shouldn't happen given the query's own IS_DEFINED filter, but
      // there's nowhere to send this without an address regardless.
      return "skipped";
    }

    const bike = await getBike(link.email, link.bikeId);
    if (!bike) {
      // Bike deleted since the link was created - nothing left to offer
      // a history for. Mark processed so this link stops showing up in
      // every future run.
      await markShareLinkFollowUpSent(link.id);
      return "skipped";
    }

    if (isBikeReadOnly(bike) || (await hasActiveTransferRequestForBike(link.email, link.bikeId))) {
      // Already handed off, or already requested by someone - either way
      // the follow-up would be redundant or actively unwelcome.
      await markShareLinkFollowUpSent(link.id);
      return "skipped";
    }

    await sendHistoryFollowUpEmail({
      recipientEmail: link.recipientEmail,
      bikeSummary: { make: bike.make, model: bike.model, year: bike.year, isCustomBuild: !!bike.isCustomBuild },
      reportUrl: `${appUrl}/report/${link.id}/detailed`,
    });
    await markShareLinkFollowUpSent(link.id);
    return "sent";
  } catch (err) {
    // Not marked as sent on failure - left eligible so tomorrow's run
    // retries it, same as a transient failure anywhere else in this app
    // degrading to "try again next time" rather than lost.
    console.error(`History follow-up failed for share link ${link.id}:`, err);
    return "failed";
  }
}

async function processCarShareLink(link: CarShareLinkDoc, appUrl: string): Promise<FollowUpOutcome> {
  try {
    if (!link.recipientEmail) {
      return "skipped";
    }

    const car = await getCarById(link.email, link.carId);
    if (!car) {
      await markCarShareLinkFollowUpSent(link.id);
      return "skipped";
    }

    if (isCarReadOnly(car) || (await hasActiveCarTransferRequestForCar(link.email, link.carId))) {
      await markCarShareLinkFollowUpSent(link.id);
      return "skipped";
    }

    await sendCarHistoryFollowUpEmail({
      recipientEmail: link.recipientEmail,
      carSummary: { make: car.make, model: car.model, year: car.year, isCustomBuild: !!car.isCustomBuild },
      reportUrl: `${appUrl}/car-report/${link.id}/detailed`,
    });
    await markCarShareLinkFollowUpSent(link.id);
    return "sent";
  } catch (err) {
    console.error(`Car history follow-up failed for share link ${link.id}:`, err);
    return "failed";
  }
}

function tally(outcomes: PromiseSettledResult<FollowUpOutcome>[]) {
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const outcome of outcomes) {
    // processBikeShareLink/processCarShareLink always catch their own
    // errors and resolve rather than reject - a "rejected" result here
    // would mean something slipped past that, so it's counted as a
    // failure the same way, rather than silently dropped.
    if (outcome.status === "rejected" || outcome.value === "failed") failed++;
    else if (outcome.value === "skipped") skipped++;
    else sent++;
  }
  return { sent, skipped, failed };
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";

    const bikeCandidates = await getShareLinksNeedingFollowUp();
    const bikeOutcomes = await runInBatches(bikeCandidates, CRON_BATCH_SIZE, (link) => processBikeShareLink(link, appUrl));
    const bikeTally = tally(bikeOutcomes);

    const carCandidates = await getCarShareLinksNeedingFollowUp();
    const carOutcomes = await runInBatches(carCandidates, CRON_BATCH_SIZE, (link) => processCarShareLink(link, appUrl));
    const carTally = tally(carOutcomes);

    const checked = bikeCandidates.length + carCandidates.length;
    const sent = bikeTally.sent + carTally.sent;
    const skipped = bikeTally.skipped + carTally.skipped;
    const failed = bikeTally.failed + carTally.failed;

    return NextResponse.json({ ok: true, checked, sent, skipped, ...(failed ? { failed } : {}) });
  } catch (err) {
    console.error("send-history-follow-ups: unexpected top-level failure:", err);
    return NextResponse.json({ error: "Unexpected error sending history follow-ups" }, { status: 500 });
  }
}
