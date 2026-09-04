// Place at: src/app/api/tomasz/clear-notifications/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { clearNotifications } from "@/lib/tracker/notification";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Not signed in as admin." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { broadcasts, recipients } = body as {
    broadcasts?: "all" | { title: string; body: string; createdAt: string }[];
    recipients?: "all" | string[];
  };

  if (broadcasts == null || recipients == null) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  if (broadcasts !== "all" && (!Array.isArray(broadcasts) || broadcasts.length === 0)) {
    return NextResponse.json({ error: "Choose at least one notification to clear." }, { status: 400 });
  }
  if (recipients !== "all" && (!Array.isArray(recipients) || recipients.length === 0)) {
    return NextResponse.json({ error: "Choose at least one user." }, { status: 400 });
  }

  try {
    const deletedCount = await clearNotifications({ broadcasts, recipients });
    return NextResponse.json({ ok: true, deletedCount });
  } catch (err) {
    console.error("Failed to clear notifications:", err);
    return NextResponse.json({ error: "Could not clear notifications." }, { status: 500 });
  }
}
