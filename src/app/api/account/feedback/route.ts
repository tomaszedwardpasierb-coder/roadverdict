// Place at: src/app/api/account/feedback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { sendFeedbackEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 4000;
const VALID_TYPES = ["feature", "bug", "other"] as const;

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

  const { type, message } = body as { type?: string; message?: string };
  if (!type || !(VALID_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: "Please choose a feedback type." }, { status: 400 });
  }
  const trimmed = message?.trim();
  if (!trimmed) {
    return NextResponse.json({ error: "Please enter a message." }, { status: 400 });
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.` }, { status: 400 });
  }

  try {
    await sendFeedbackEmail(session.email, type as "feature" | "bug" | "other", trimmed);
  } catch (err) {
    console.error("feedback: failed to send email:", err);
    return NextResponse.json({ error: "Could not send your feedback right now. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
