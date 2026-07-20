// Place at: src/app/api/tracker/reminders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createReminder, deleteRemindersBySourceKey } from "@/lib/tracker/reminder";

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

  const { name, intervalType, intervalValue, exactDate, baseMileage, date, sourceKey } = body as {
    name?: string;
    intervalType?: "mileage" | "months" | "date";
    intervalValue?: number;
    exactDate?: string;
    baseMileage?: number;
    date?: string;
    sourceKey?: string;
  };

  if (!name || !intervalType || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }
  if (intervalType !== "date" && !intervalValue) {
    return NextResponse.json({ error: "Please enter an interval." }, { status: 400 });
  }
  if (intervalType === "date" && !exactDate) {
    return NextResponse.json({ error: "Please pick a date." }, { status: 400 });
  }

  if (sourceKey) {
    await deleteRemindersBySourceKey(session.email, sourceKey);
  }

  const reminder = await createReminder(session.email, {
    name,
    intervalType,
    intervalValue,
    exactDate,
    baseMileage,
    date,
    sourceKey,
  });

  return NextResponse.json({ reminder });
}
