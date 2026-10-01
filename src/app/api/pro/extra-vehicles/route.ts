// Place at: src/app/api/pro/extra-vehicles/route.ts
//
// Buys or drops one extra vehicle (£1.99/month) on top of Pro - see
// extraVehicles.ts. The website's garage is the only caller: the
// Android app never sells anything.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { addExtraVehicle, removeExtraVehicle } from "@/lib/payments/extraVehicles";
import { getBikesForUser, countActiveBikes } from "@/lib/tracker/bike";
import { getCarsForUser, countActiveCars } from "@/lib/tracker/car";

export const dynamic = "force-dynamic";

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
  const { action } = (body ?? {}) as { action?: unknown };

  if (action === "add") {
    const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
    const result = await addExtraVehicle(session.email, appUrl);
    if (result.ok) return NextResponse.json("url" in result ? { url: result.url } : { quantity: result.quantity });
    if (result.reason === "not_eligible") {
      return NextResponse.json({ error: "Extra vehicles are for Pro subscriptions." }, { status: 403 });
    }
    if (result.reason === "at_max") {
      return NextResponse.json({ error: "Your account already has the most vehicles it can track." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not add an extra vehicle - your card hasn't been charged. Please try again." }, { status: 502 });
  }

  if (action === "remove") {
    const [bikes, cars] = await Promise.all([getBikesForUser(session.email), getCarsForUser(session.email)]);
    const result = await removeExtraVehicle(session.email, countActiveBikes(bikes) + countActiveCars(cars));
    if (result.ok) return NextResponse.json({ quantity: result.quantity });
    if (result.reason === "none") {
      return NextResponse.json({ error: "Your account has no extra vehicles." }, { status: 409 });
    }
    if (result.reason === "too_many_vehicles") {
      return NextResponse.json(
        { error: "Your garage is still using that slot - remove or transfer a vehicle first." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Could not remove the extra vehicle. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ error: "action must be 'add' or 'remove'." }, { status: 400 });
}
