// Place at: src/app/api/tomasz/feedback/[id]/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { updateFeedbackStatus, type FeedbackStatus } from "@/lib/tracker/feedback";

export const dynamic = "force-dynamic";

const VALID_STATUSES: FeedbackStatus[] = ["new", "reviewed", "resolved"];

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Not signed in as admin." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { status } = body as { status?: string };
  if (!status || !VALID_STATUSES.includes(status as FeedbackStatus)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  try {
    await updateFeedbackStatus(params.id, status as FeedbackStatus);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to update feedback status:", err);
    return NextResponse.json({ error: "Could not update status." }, { status: 500 });
  }
}
