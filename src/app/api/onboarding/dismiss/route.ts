// Place at: src/app/api/onboarding/dismiss/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { setOnboardingChecklistDismissed } from "@/lib/tracker/userAccount";

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
  const { dismissed } = body as { dismissed?: boolean };
  if (typeof dismissed !== "boolean") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  await setOnboardingChecklistDismissed(session.email, dismissed);
  return NextResponse.json({ ok: true });
}
