// Place at: src/app/api/tracker/share-link/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getOrCreateShareToken } from "@/lib/tracker/shareLink";
import { getPrimaryBike } from "@/lib/tracker/bike";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const bike = await getPrimaryBike(session.email);
  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }
  const token = await getOrCreateShareToken(session.email, bike.id);
  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  return NextResponse.json({ url: `${appUrl}/report/${token}` });
}
