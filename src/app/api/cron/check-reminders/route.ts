// Place at: src/app/api/cron/check-reminders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAllReminders, computeReminderStatus, reminderDetailLabel, markReminderNotified } from "@/lib/tracker/reminder";
import { getBike } from "@/lib/tracker/bike";
import { sendReminderEmail } from "@/lib/resend";
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
    let failed = 0;

    for (const reminder of reminders) {
      checked++;
      if (reminder.notifiedAt) continue;

      // Isolated per reminder: one failed send/mark shouldn't stop every
      // other reminder in the same run from being checked, same as
      // send-history-follow-ups' per-item handling. Left un-notified on
      // failure so tomorrow's run retries it.
      try {
        const email = reminder.pk;
        let currentMileage = 0;
        if (reminder.intervalType === "mileage") {
          if (!reminder.bikeId) continue; // pre-migration data shouldn't exist anymore, but skip defensively rather than crash
          const bike = await getBike(email, reminder.bikeId);
          if (!bike) continue;
          currentMileage = bike.currentMileage;
        }

        const status = computeReminderStatus(reminder, currentMileage);
        if (status !== "overdue") continue;

        // Automated reminder emails are a Premium perk - free accounts
        // still see the reminder (partially obscured) on the dashboard,
        // but nothing gets sent on their behalf. Left un-notified (not
        // marked) so the email goes out the day they upgrade, rather
        // than being silently lost.
        if (!(await isPro(email))) continue;

        await sendReminderEmail(email, reminder.name, reminderDetailLabel(reminder));
        await markReminderNotified(email, reminder.id);
        sent++;
      } catch (err) {
        console.error(`Reminder check failed for reminder ${reminder.id}:`, err);
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
      failed,
    });

    return NextResponse.json({ ok: true, checked, sent, ...(failed ? { failed } : {}) });
  } catch {
    return NextResponse.json({ error: "Unexpected error checking reminders" }, { status: 500 });
  }
}
