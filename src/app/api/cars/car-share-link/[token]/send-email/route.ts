// Place at: src/app/api/cars/car-share-link/[token]/send-email/route.ts
// Car mirror of api/tracker/share-link/[token]/send-email/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCarShareLink } from "@/lib/tracker/carShareLink";
import { getCarById } from "@/lib/tracker/car";
import { sendShareLinkEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export async function POST(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
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

  const link = await getCarShareLink(params.token);
  if (!link || link.email !== session.email) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }

  const car = await getCarById(link.email, link.carId);
  if (!car) {
    return NextResponse.json({ error: "Car not found." }, { status: 404 });
  }

  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  const carName = car.nickname ? `${car.nickname} (${car.make} ${car.model})` : `${car.make} ${car.model}`;
  const expiresAtLabel = link.expiresAt ? fmtDate(link.expiresAt) : "no expiry date";

  try {
    await sendShareLinkEmail(toEmail, carName, `${appUrl}/car-report/${link.id}`, expiresAtLabel);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Could not send the email. Please try again.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
