// Place at: src/app/api/cron/check-reminders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAllReminders, computeReminderStatus, reminderDetailLabel, markReminderNotified } from "@/lib/tracker/reminder";
import { getBike } from "@/lib/tracker/bike";
import { sendReminderEmail } from "@/lib/resend";
import { getContainer } from "@/lib/cosmos";

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

    for (const reminder of reminders) {
      checked++;
      if (reminder.notifiedAt) continue;

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

      await sendReminderEmail(email, reminder.name, reminderDetailLabel(reminder));
      await markReminderNotified(email, reminder.id);
      sent++;
    }

    const container = getContainer();
    await container.items.upsert({
      id: "cronStatus::reminders",
      pk: "system",
      type: "cronStatus",
      lastRunAt: new Date().toISOString(),
      checked,
      sent,
    });

    return NextResponse.json({ ok: true, checked, sent });
  } catch {
    return NextResponse.json({ error: "Unexpected error checking reminders" }, { status: 500 });
  }
}
