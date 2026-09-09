// Place at: src/app/api/account/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateProfile } from "@/lib/tracker/userAccount";

export const dynamic = "force-dynamic";

const MAX_DISPLAY_NAME_LENGTH = 60;

export async function PATCH(request: NextRequest) {
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

  const { displayName } = body as { displayName?: string | null };
  if (displayName !== undefined && displayName !== null) {
    const trimmed = displayName.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "Please enter a name, or leave it blank to clear it." }, { status: 400 });
    }
    if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
      return NextResponse.json({ error: `Name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.` }, { status: 400 });
    }
    await updateProfile(session.email, { displayName: trimmed });
    return NextResponse.json({ displayName: trimmed });
  }

  // Explicit null clears it - distinct from the field being omitted
  // entirely, which this route treats as "nothing to change."
  if (displayName === null) {
    await updateProfile(session.email, { displayName: null });
    return NextResponse.json({ displayName: null });
  }

  return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
}
