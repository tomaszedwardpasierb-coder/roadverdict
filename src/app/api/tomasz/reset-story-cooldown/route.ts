// Place at: src/app/api/tomasz/reset-story-cooldown/route.ts
//
// The 7-day Story So Far cooldown (src/app/api/tracker/story-so-far/
// route.ts) is keyed entirely off bike.storyCache.generatedAt - clearing
// that cache is enough for the next real request to regenerate, since
// there's nothing left to be within-cooldown against. Clears every
// bike on the account, not just the primary one, so this still works
// for a multi-bike Pro account.
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { getBikesForUser, updateBikeStoryCache } from "@/lib/tracker/bike";

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
  const { email } = body as { email?: string };
  if (!email || !email.trim()) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  const targetEmail = email.trim().toLowerCase();

  const bikes = await getBikesForUser(targetEmail);
  if (bikes.length === 0) {
    return NextResponse.json({ error: "No bikes found for that account." }, { status: 404 });
  }

  await Promise.all(bikes.map((bike) => updateBikeStoryCache(targetEmail, bike.id, undefined)));

  return NextResponse.json({ ok: true, bikesReset: bikes.length });
}
