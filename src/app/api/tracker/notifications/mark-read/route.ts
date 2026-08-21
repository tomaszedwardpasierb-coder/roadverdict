// Place at: src/app/api/tracker/notifications/mark-read/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/tracker/notification";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // No body, or a body with no id, means "mark everything read" - the
  // bell's own "mark all as read" action. A specific id marks just that
  // one notification, e.g. when it's clicked to follow its own link.
  let id: string | undefined;
  try {
    const body = (await request.json()) as { id?: string };
    if (typeof body.id === "string") id = body.id;
  } catch {
    // No body sent, or not valid JSON - fall through to "mark all".
  }

  if (id) {
    await markNotificationRead(id, session.email);
  } else {
    await markAllNotificationsRead(session.email);
  }

  return NextResponse.json({ ok: true });
}
