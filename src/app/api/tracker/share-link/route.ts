// Place at: src/app/api/tracker/share-link/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createShareLink, type ShareLinkDuration } from "@/lib/tracker/shareLink";
import { getPrimaryBike } from "@/lib/tracker/bike";

export const dynamic = "force-dynamic";

const VALID_DURATIONS: ShareLinkDuration[] = ["1week", "1month", "6months"];

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

  const { duration, recipientEmail } = body as { duration?: ShareLinkDuration; recipientEmail?: string };
  if (!duration || !VALID_DURATIONS.includes(duration)) {
    return NextResponse.json({ error: "Please choose how long this link should stay valid for." }, { status: 400 });
  }
  // Required - this becomes the identifier used for any receipt access
  // request made through this specific link, rather than trusting
  // whatever an anonymous report viewer types into a form later.
  if (!recipientEmail || typeof recipientEmail !== "string" || !recipientEmail.includes("@")) {
    return NextResponse.json({ error: "Please enter the email address you're sharing this link with." }, { status: 400 });
  }

  const bike = await getPrimaryBike(session.email);
  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }

  const link = await createShareLink(session.email, bike.id, duration, recipientEmail);
  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  return NextResponse.json({ url: `${appUrl}/report/${link.id}`, expiresAt: link.expiresAt, recipientEmail: link.recipientEmail });
}
