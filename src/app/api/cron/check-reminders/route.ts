// Place at: src/app/api/cron/check-reminders/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  getAllReminders,
  computeReminderStatus,
  reminderDetailLabel,
  markReminderNotified,
  markReminderDueSoonBellNotified,
  markReminderOverdueBellNotified,
  type ReminderDoc,
} from "@/lib/tracker/reminder";
import { getBike } from "@/lib/tracker/bike";
import {
  getAllCarReminders,
  markCarReminderNotified,
  markCarReminderDueSoonBellNotified,
  markCarReminderOverdueBellNotified,
  type CarReminderDoc,
} from "@/lib/tracker/carReminder";
import { computeCarReminderStatus, carReminderDetailLabel } from "@/lib/tracker/carReminderStatus";
import { getCarById } from "@/lib/tracker/car";
import { sendReminderEmail } from "@/lib/resend";
import { createReminderNotification } from "@/lib/tracker/notification";
import { getContainer } from "@/lib/cosmos";
import { isPro } from "@/lib/subscriptions";
import { runInBatches } from "@/lib/concurrency";

export const dynamic = "force-dynamic";

// How many reminders this checks/emails at once - was a plain sequential
// for-loop (one reminder's read/notify/email/mark fully finished, Resend
// call included, before the next one even started), so total run time
// scaled linearly with total reminder count across every user with zero
// parallelism. Chunked via runInBatches rather than one big Promise.all
// over every reminder in the database, so concurrent Cosmos/Resend load
// stays bounded as the reminder count grows.
const CRON_BATCH_SIZE = 20;

interface ReminderCheckOutcome {
  notified: number;
  sent: boolean;
  failed: boolean;
}

// Isolated per reminder: one failed send/mark shouldn't stop every other
// reminder in the same run from being checked, same as
// send-history-follow-ups' per-item handling. Left un-marked on failure
// so tomorrow's run retries it. Caught here rather than left to reject,
// so a failure surfaces as a ReminderCheckOutcome the caller can count
// without runInBatches' Promise.allSettled ever actually seeing a
// rejection.
async function checkReminder(reminder: ReminderDoc): Promise<ReminderCheckOutcome> {
  // Declared outside the try, not inside: if the bell notification below
  // succeeds but the later email send throws, the exception must not
  // erase that already-real progress - the catch block below returns
  // these same variables, not a hardcoded zeroed-out outcome, so a
  // partial success within one reminder is still counted as such.
  let notified = 0;
  let sent = false;
  try {
    const email = reminder.pk;
    if (!reminder.bikeId) return { notified, sent, failed: false }; // pre-migration data shouldn't exist anymore, but skip defensively rather than crash
    const bike = await getBike(email, reminder.bikeId);
    if (!bike) return { notified, sent, failed: false };

    const status = computeReminderStatus(reminder, bike.currentMileage);
    const vehicleName = bike.nickname || `${bike.make} ${bike.model}`;

    // In-app bell notification - available to every account regardless
    // of Pro status, unlike the email below. Deduped per transition via
    // dueSoonBellNotifiedAt/overdueBellNotifiedAt, so each only ever
    // fires once per reminder occurrence.
    if (status === "due-soon" && !reminder.dueSoonBellNotifiedAt) {
      await createReminderNotification(email, {
        title: reminder.name,
        body: `Due soon for ${vehicleName} - ${reminderDetailLabel(reminder)}`,
      });
      await markReminderDueSoonBellNotified(email, reminder.id);
      notified++;
    }

    if (status === "overdue") {
      if (!reminder.overdueBellNotifiedAt) {
        await createReminderNotification(email, {
          title: reminder.name,
          body: `Overdue for ${vehicleName} - ${reminderDetailLabel(reminder)}`,
        });
        await markReminderOverdueBellNotified(email, reminder.id);
        notified++;
      }

      // Automated reminder emails are a Premium perk - free accounts
      // still see the reminder (partially obscured) on the dashboard,
      // but nothing gets sent on their behalf. Left un-notified (not
      // marked) so the email goes out the day they upgrade, rather than
      // being silently lost.
      if (!reminder.notifiedAt && (await isPro(email))) {
        await sendReminderEmail(email, reminder.name, reminderDetailLabel(reminder));
        await markReminderNotified(email, reminder.id);
        sent = true;
      }
    }

    return { notified, sent, failed: false };
  } catch (err) {
    console.error(`Reminder check failed for reminder ${reminder.id}:`, err);
    return { notified, sent, failed: true };
  }
}

// Car reminders - mirrored, not shared, same sister-schema convention as
// every other bike/car pair in this app: getAllCarReminders/getCarById/
// computeCarReminderStatus/carReminderDetailLabel/markCarReminderNotified
// instead of their bike equivalents. Counted into the SAME checked/sent/
// notified/failed totals and the same cronStatus doc - there's exactly
// one daily reminder run, not two separately-tracked ones per vehicle
// kind.
async function checkCarReminder(reminder: CarReminderDoc): Promise<ReminderCheckOutcome> {
  // See checkReminder's own comment on why these live outside the try.
  let notified = 0;
  let sent = false;
  try {
    const email = reminder.pk;
    if (!reminder.carId) return { notified, sent, failed: false };
    const car = await getCarById(email, reminder.carId);
    if (!car) return { notified, sent, failed: false };

    const status = computeCarReminderStatus(reminder, car.currentMileage);
    const vehicleName = car.nickname || `${car.make} ${car.model}`;

    if (status === "due-soon" && !reminder.dueSoonBellNotifiedAt) {
      await createReminderNotification(email, {
        title: reminder.name,
        body: `Due soon for ${vehicleName} - ${carReminderDetailLabel(reminder)}`,
      });
      await markCarReminderDueSoonBellNotified(email, reminder.id);
      notified++;
    }

    if (status === "overdue") {
      if (!reminder.overdueBellNotifiedAt) {
        await createReminderNotification(email, {
          title: reminder.name,
          body: `Overdue for ${vehicleName} - ${carReminderDetailLabel(reminder)}`,
        });
        await markCarReminderOverdueBellNotified(email, reminder.id);
        notified++;
      }

      if (!reminder.notifiedAt && (await isPro(email))) {
        await sendReminderEmail(email, reminder.name, carReminderDetailLabel(reminder));
        await markCarReminderNotified(email, reminder.id);
        sent = true;
      }
    }

    return { notified, sent, failed: false };
  } catch (err) {
    console.error(`Car reminder check failed for reminder ${reminder.id}:`, err);
    return { notified, sent, failed: true };
  }
}

function tally(outcomes: PromiseSettledResult<ReminderCheckOutcome>[]) {
  let sent = 0;
  let notified = 0;
  let failed = 0;
  for (const outcome of outcomes) {
    // checkReminder/checkCarReminder always catch their own errors and
    // resolve rather than reject - a "rejected" result here would mean
    // something slipped past that, so it's counted as a failure the same
    // way, rather than silently dropped.
    if (outcome.status === "rejected") {
      failed++;
      continue;
    }
    notified += outcome.value.notified;
    if (outcome.value.sent) sent++;
    if (outcome.value.failed) failed++;
  }
  return { sent, notified, failed };
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const reminders = await getAllReminders();
    const bikeOutcomes = await runInBatches(reminders, CRON_BATCH_SIZE, checkReminder);
    const bikeTally = tally(bikeOutcomes);

    const carReminders = await getAllCarReminders();
    const carOutcomes = await runInBatches(carReminders, CRON_BATCH_SIZE, checkCarReminder);
    const carTally = tally(carOutcomes);

    const checked = reminders.length + carReminders.length;
    const sent = bikeTally.sent + carTally.sent;
    const notified = bikeTally.notified + carTally.notified;
    const failed = bikeTally.failed + carTally.failed;

    const container = getContainer();
    await container.items.upsert({
      id: "cronStatus::reminders",
      pk: "system",
      type: "cronStatus",
      lastRunAt: new Date().toISOString(),
      checked,
      sent,
      notified,
      failed,
    });

    return NextResponse.json({ ok: true, checked, sent, notified, ...(failed ? { failed } : {}) });
  } catch {
    return NextResponse.json({ error: "Unexpected error checking reminders" }, { status: 500 });
  }
}
