// Place at: src/app/api/tracker/notifications/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getNotificationsForUser, getUnreadNotificationCount } from "@/lib/tracker/notification";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const [notifications, unreadCount] = await Promise.all([
    getNotificationsForUser(session.email),
    getUnreadNotificationCount(session.email),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}
