// Place at: src/app/api/tomasz/send-notification/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { createBroadcastNotifications, getAllUserEmails } from "@/lib/tracker/notification";
import { getSafeRedirectPath } from "@/lib/auth/safeRedirect";

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
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { title, message, linkTo, recipients } = body as {
    title?: string;
    message?: string;
    linkTo?: string;
    recipients?: "all" | string[];
  };

  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "A message is required." }, { status: 400 });
  }

  // Reused rather than duplicated - an admin-supplied link going out to
  // potentially every user deserves the same validation as any other
  // redirect destination in this app, even though the admin is trusted.
  // Mainly guards against an honest typo (a missing leading slash, say)
  // producing a broken link for every single recipient at once, not
  // just malicious input.
  const safeLinkTo = getSafeRedirectPath(linkTo);

  let recipientEmails: string[];
  if (recipients === "all") {
    recipientEmails = await getAllUserEmails();
  } else if (Array.isArray(recipients) && recipients.length > 0 && recipients.every((r) => typeof r === "string" && r.includes("@"))) {
    recipientEmails = recipients;
  } else {
    return NextResponse.json({ error: "Choose at least one recipient." }, { status: 400 });
  }

  if (recipientEmails.length === 0) {
    return NextResponse.json({ error: "No recipients found to send to." }, { status: 400 });
  }

  await createBroadcastNotifications(recipientEmails, {
    title: title.trim(),
    body: message.trim(),
    linkTo: safeLinkTo ?? undefined,
  });

  return NextResponse.json({ ok: true, sentCount: recipientEmails.length });
}
