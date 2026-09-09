// Place at: src/app/api/cars/car-share-link/route.ts
// Car mirror of api/tracker/share-link/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createCarShareLink } from "@/lib/tracker/carShareLink";
import type { ShareLinkDuration } from "@/lib/tracker/shareLink";
import { getPrimaryCar } from "@/lib/tracker/car";
import { logImpersonationActivityForCurrentRequest } from "@/lib/admin/impersonation";

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

  const { duration, recipientEmail, askingPrice } = body as { duration?: ShareLinkDuration; recipientEmail?: string; askingPrice?: number };
  if (!duration || !VALID_DURATIONS.includes(duration)) {
    return NextResponse.json({ error: "Please choose how long this link should stay valid for." }, { status: 400 });
  }
  if (!recipientEmail || typeof recipientEmail !== "string" || !recipientEmail.includes("@")) {
    return NextResponse.json({ error: "Please enter the email address you're sharing this link with." }, { status: 400 });
  }

  let validatedAskingPrice: number | undefined;
  if (askingPrice !== undefined) {
    if (typeof askingPrice !== "number" || !Number.isFinite(askingPrice) || askingPrice <= 0 || askingPrice > 200000) {
      return NextResponse.json({ error: "Enter a valid asking price, or leave it blank." }, { status: 400 });
    }
    validatedAskingPrice = askingPrice;
  }

  const car = await getPrimaryCar(session.email);
  if (!car) {
    return NextResponse.json({ error: "No car found for this account." }, { status: 404 });
  }

  const link = await createCarShareLink(session.email, car.id, duration, recipientEmail, validatedAskingPrice);
  void logImpersonationActivityForCurrentRequest("carShareLink", link.id, "create");
  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  return NextResponse.json({
    url: `${appUrl}/car-report/${link.id}`,
    expiresAt: link.expiresAt,
    recipientEmail: link.recipientEmail,
    askingPrice: link.askingPrice ?? null,
  });
}
