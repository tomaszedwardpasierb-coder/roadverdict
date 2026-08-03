// Place at: src/app/api/tracker/bills/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createBill } from "@/lib/tracker/bill";
import { createReminder, deleteRemindersBySourceKey } from "@/lib/tracker/reminder";
import { getPrimaryBike } from "@/lib/tracker/bike";
import { isBeforeProduction } from "@/lib/tracker/productionYearCheck";
import { BILL_LABELS } from "@/lib/tracker/billTypes";
import type { Attachment } from "@/lib/tracker/cosmosHelpers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { billType, cost, date, notes, reminder, attachments } = body as {
    billType?: string;
    cost?: number;
    date?: string;
    notes?: string;
    reminder?: {
      intervalType: "mileage" | "months" | "date";
      intervalValue?: number;
      exactDate?: string;
      additionalTriggers?: { intervalType: "mileage" | "months" | "date"; intervalValue?: number; exactDate?: string }[];
    };
    attachments?: Attachment[];
  };

  if (!billType || cost == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  const bike = await getPrimaryBike(session.email);
  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }

  if (isBeforeProduction(date, bike)) {
    return NextResponse.json({ error: `This date is before ${bike.year}, when this bike was made.` }, { status: 400 });
  }

  const bill = await createBill(session.email, { bikeId: bike.id, billType, cost, date, notes: notes ?? "", attachments });

  if (reminder) {
    const sourceKey = `bill:${billType}`;
    await deleteRemindersBySourceKey(session.email, bike.id, sourceKey);
    await createReminder(session.email, {
      bikeId: bike.id,
      name: `${BILL_LABELS[billType] ?? billType} renewal`,
      intervalType: reminder.intervalType,
      intervalValue: reminder.intervalValue,
      exactDate: reminder.exactDate,
      additionalTriggers: reminder.additionalTriggers,
      baseMileage: bike.currentMileage,
      date,
      sourceKey,
    });
  }

  return NextResponse.json({ bill });
}
