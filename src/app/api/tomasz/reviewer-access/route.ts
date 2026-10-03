// Place at: src/app/api/tomasz/reviewer-access/route.ts
//
// Switches the app store reviewers' sign-in on or off (see
// lib/auth/reviewerAccess.ts). POST makes a new code and returns it - the
// only time it's ever shown; DELETE switches it off.
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { disableReviewerAccess, enableReviewerAccess } from "@/lib/auth/reviewerAccess";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Not signed in as admin." }, { status: 401 });
  }
  const { code, enabledAt } = await enableReviewerAccess();
  return NextResponse.json({ code, enabledAt }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Not signed in as admin." }, { status: 401 });
  }
  await disableReviewerAccess();
  return NextResponse.json({ ok: true });
}
