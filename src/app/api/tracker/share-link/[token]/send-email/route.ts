// Place at: src/app/api/tracker/share-link/[token]/send-email/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getShareLink } from "@/lib/tracker/shareLink";
import { getBike } from "@/lib/tracker/bike";
import { sendShareLinkEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
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

  const { toEmail } = body as { toEmail?: string };
  if (!toEmail || !toEmail.includes("@")) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const link = await getShareLink(params.token);
  if (!link || link.email !== session.email) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }

  const bike = await getBike(link.email, link.bikeId);
  if (!bike) {
    return NextResponse.json({ error: "Bike not found." }, { status: 404 });
  }

  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  const bikeName = bike.nickname ? `${bike.nickname} (${bike.make} ${bike.model})` : `${bike.make} ${bike.model}`;
  const expiresAtLabel = link.expiresAt ? fmtDate(link.expiresAt) : "no expiry date";

  try {
    await sendShareLinkEmail(toEmail, bikeName, `${appUrl}/report/${link.id}`, expiresAtLabel);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Could not send the email. Please try again.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
