// Place at: src/app/api/account/cancel-deletion/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { cancelAccountDeletion } from "@/lib/tracker/userAccount";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  await cancelAccountDeletion(session.email);
  return NextResponse.json({ ok: true });
}
