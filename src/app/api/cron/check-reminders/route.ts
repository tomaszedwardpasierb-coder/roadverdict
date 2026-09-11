// Place at: src/app/api/cron/check-reminders/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  getAllReminders,
  computeReminderStatus,
  reminderDetailLabel,
  markReminderNotified,
  markReminderDueSoonBellNotified,
  markReminderOverdueBellNotified,
} from "@/lib/tracker/reminder";
import { getBike } from "@/lib/tracker/bike";
import {
  getAllCarReminders,
  markCarReminderNotified,
  markCarReminderDueSoonBellNotified,
  markCarReminderOverdueBellNotified,
} from "@/lib/tracker/carReminder";
import { computeCarReminderStatus, carReminderDetailLabel } from "@/lib/tracker/carReminderStatus";
import { getCarById } from "@/lib/tracker/car";
import { sendReminderEmail } from "@/lib/resend";
import { createReminderNotification } from "@/lib/tracker/notification";
import { getContainer } from "@/lib/cosmos";
import { isPro } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const reminders = await getAllReminders();
    let checked = 0;
    let sent = 0;
    let notified = 0;
    let failed = 0;

    for (const reminder of reminders) {
      checked++;

      // Isolated per reminder: one failed send/mark shouldn't stop every
      // other reminder in the same run from being checked, same as
      // send-history-follow-ups' per-item handling. Left un-marked on
      // failure so tomorrow's run retries it.
      try {
        const email = reminder.pk;
        if (!reminder.bikeId) continue; // pre-migration data shouldn't exist anymore, but skip defensively rather than crash
        const bike = await getBike(email, reminder.bikeId);
        if (!bike) continue;

        const status = computeReminderStatus(reminder, bike.currentMileage);
        const vehicleName = bike.nickname || `${bike.make} ${bike.model}`;

        // In-app bell notification - available to every account
        // regardless of Pro status, unlike the email below. Deduped per
        // transition via dueSoonBellNotifiedAt/overdueBellNotifiedAt, so
        // each only ever fires once per reminder occurrence.
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
          // marked) so the email goes out the day they upgrade, rather
          // than being silently lost.
          if (!reminder.notifiedAt && (await isPro(email))) {
            await sendReminderEmail(email, reminder.name, reminderDetailLabel(reminder));
            await markReminderNotified(email, reminder.id);
            sent++;
          }
        }
      } catch (err) {
        console.error(`Reminder check failed for reminder ${reminder.id}:`, err);
        failed++;
      }
    }

    // Car reminders - mirrored, not shared, same sister-schema convention
    // as every other bike/car pair in this app: getAllCarReminders/
    // getCarById/computeCarReminderStatus/carReminderDetailLabel/
    // markCarReminderNotified instead of their bike equivalents. Counted
    // into the SAME checked/sent/notified/failed totals and the same
    // cronStatus doc below - there's exactly one daily reminder run, not
    // two separately-tracked ones per vehicle kind.
    const carReminders = await getAllCarReminders();
    for (const reminder of carReminders) {
      checked++;

      try {
        const email = reminder.pk;
        if (!reminder.carId) continue;
        const car = await getCarById(email, reminder.carId);
        if (!car) continue;

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
            sent++;
          }
        }
      } catch (err) {
        console.error(`Car reminder check failed for reminder ${reminder.id}:`, err);
        failed++;
      }
    }

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
