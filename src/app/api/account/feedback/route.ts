// Place at: src/app/api/account/feedback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { sendFeedbackEmail } from "@/lib/resend";
import { createFeedback, type FeedbackKind } from "@/lib/tracker/feedback";
import type { Attachment } from "@/lib/tracker/cosmosHelpers";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 4000;
const VALID_TYPES = ["feature", "bug", "other"] as const;
const MAX_ATTACHMENTS = 3;
const ALLOWED_ATTACHMENT_TYPES = new Set(["image/jpeg", "image/png"]);

function isValidAttachment(a: unknown): a is Attachment {
  if (!a || typeof a !== "object") return false;
  const { blobName, fileName, fileType, uploadedAt } = a as Record<string, unknown>;
  return (
    typeof blobName === "string" &&
    typeof fileName === "string" &&
    typeof fileType === "string" &&
    ALLOWED_ATTACHMENT_TYPES.has(fileType) &&
    typeof uploadedAt === "string"
  );
}

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

  const { type, message, attachments, source } = body as { type?: string; message?: string; attachments?: unknown; source?: string };
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

  // Attachments are only ever meaningful on a bug report - a feature
  // request or "other" submission never carries any, even if the client
  // somehow sent some (defensive, not expected in practice).
  let validAttachments: Attachment[] | undefined;
  if (type === "bug" && Array.isArray(attachments) && attachments.length > 0) {
    if (attachments.length > MAX_ATTACHMENTS) {
      return NextResponse.json({ error: `Up to ${MAX_ATTACHMENTS} attachments allowed.` }, { status: 400 });
    }
    if (!attachments.every(isValidAttachment)) {
      return NextResponse.json({ error: "One or more attachments look invalid - only PNG/JPG screenshots are allowed." }, { status: 400 });
    }
    validAttachments = attachments;
  }
  const validSource: "settings" | "assistant" = source === "assistant" ? "assistant" : "settings";

  // The durable record is now the source of truth - a submission that
  // fails to save here genuinely failed, unlike the email below, which
  // is only a courtesy notification on top of it.
  try {
    await createFeedback(session.email, type as FeedbackKind, trimmed, validAttachments, validSource);
  } catch (err) {
    console.error("feedback: failed to save:", err);
    return NextResponse.json({ error: "Could not save your feedback right now. Please try again." }, { status: 500 });
  }

  try {
    await sendFeedbackEmail(session.email, type as "feature" | "bug" | "other", trimmed);
  } catch (err) {
    console.error("feedback: failed to send notification email (feedback was still saved):", err);
  }

  return NextResponse.json({ ok: true });
}
