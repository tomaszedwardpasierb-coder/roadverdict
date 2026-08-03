// Place at: src/app/api/tracker/services/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createServiceRecord } from "@/lib/tracker/serviceRecord";
import { getPrimaryBike, updateBikeMileage } from "@/lib/tracker/bike";
import { createReminder, deleteRemindersBySourceKey } from "@/lib/tracker/reminder";
import { JOB_LABELS } from "@/lib/tracker/jobTypes";
import { isBeforeProduction } from "@/lib/tracker/productionYearCheck";
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

  const { jobType, cost, mileage, date, notes, reminder, attachments } = body as {
    jobType?: string;
    cost?: number;
    mileage?: number;
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

  if (!jobType || cost == null || mileage == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  const bike = await getPrimaryBike(session.email);
  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }

  if (isBeforeProduction(date, bike)) {
    return NextResponse.json({ error: `This date is before ${bike.year}, when this bike was made.` }, { status: 400 });
  }

  const record = await createServiceRecord(session.email, { bikeId: bike.id, jobType, cost, mileage, date, notes: notes ?? "", attachments });

  if (mileage > bike.currentMileage) {
    await updateBikeMileage(session.email, bike.id, mileage);
  }

  if (reminder) {
    const sourceKey = `service:${jobType}`;
    await deleteRemindersBySourceKey(session.email, bike.id, sourceKey);
    await createReminder(session.email, {
      bikeId: bike.id,
      name: JOB_LABELS[jobType] ?? jobType,
      intervalType: reminder.intervalType,
      intervalValue: reminder.intervalValue,
      exactDate: reminder.exactDate,
      additionalTriggers: reminder.additionalTriggers,
      baseMileage: mileage,
      date,
      sourceKey,
    });
  }

  return NextResponse.json({ record });
}
