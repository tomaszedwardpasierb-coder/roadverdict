// Place at: src/app/api/cron/check-reminders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAllReminders, computeReminderStatus, reminderDetailLabel, markReminderNotified } from "@/lib/tracker/reminder";
import { getBike } from "@/lib/tracker/bike";
import { sendReminderEmail } from "@/lib/resend";

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const debugInfo: any[] = [];

    for (const reminder of reminders) {
      checked++;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entry: any = {
        id: reminder.id,
        name: reminder.name,
        intervalType: reminder.intervalType,
        intervalValue: reminder.intervalValue,
        baseMileage: reminder.baseMileage,
        notifiedAt: reminder.notifiedAt,
      };

      if (reminder.notifiedAt) {
        entry.skippedReason = "already notified for this occurrence";
        debugInfo.push(entry);
        continue;
      }

      const email = reminder.pk;
      let currentMileage = 0;
      if (reminder.intervalType === "mileage") {
        const bike = await getBike(email);
        if (!bike) {
          entry.skippedReason = "no bike found for this email";
          debugInfo.push(entry);
          continue;
        }
        currentMileage = bike.currentMileage;
        entry.currentMileage = currentMileage;
      }

      const status = computeReminderStatus(reminder, currentMileage);
      entry.status = status;
      if (status !== "overdue") {
        entry.skippedReason = `status is "${status}", not overdue`;
        debugInfo.push(entry);
        continue;
      }

      await sendReminderEmail(email, reminder.name, reminderDetailLabel(reminder));
      await markReminderNotified(email, reminder.id);
      entry.sent = true;
      debugInfo.push(entry);
      sent++;
    }

    return NextResponse.json({ ok: true, checked, sent, debugInfo });
  } catch (err) {
    return NextResponse.json(
      { error: "Unexpected error checking reminders", detail: String(err) },
      { status: 500 }
    );
  }
}
