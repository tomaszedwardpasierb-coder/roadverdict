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
    // --- TEMPORARY DIAGNOSTICS - remove once this is confirmed working ---
    const container = getContainer();
    const anyDocs = await container.items.query({ query: "SELECT VALUE COUNT(1) FROM c" }).fetchAll();
    const reminderDocsRaw = await container.items
      .query({ query: "SELECT * FROM c WHERE c.type = 'reminder'" })
      .fetchAll();
    // --- end diagnostics ---

    const reminders = await getAllReminders();
    let checked = 0;
    let sent = 0;

    for (const reminder of reminders) {
      checked++;
      if (reminder.notifiedAt) continue;

      const email = reminder.pk;
      let currentMileage = 0;
      if (reminder.intervalType === "mileage") {
        const bike = await getBike(email);
        if (!bike) continue;
        currentMileage = bike.currentMileage;
      }

      const status = computeReminderStatus(reminder, currentMileage);
      if (status !== "overdue") continue;

      await sendReminderEmail(email, reminder.name, reminderDetailLabel(reminder));
      await markReminderNotified(email, reminder.id);
      sent++;
    }

    return NextResponse.json({
      ok: true,
      checked,
      sent,
      diagnostics: {
        totalDocsInContainer: anyDocs.resources[0],
        reminderDocsFoundRaw: reminderDocsRaw.resources.length,
        reminderDocsViaHelper: reminders.length,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Unexpected error checking reminders", detail: String(err) },
      { status: 500 }
    );
  }
}
