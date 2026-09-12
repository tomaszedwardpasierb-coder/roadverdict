// Place at: src/app/api/vault/status/route.ts
//
// Lets the Vault tab check "am I still unlocked" without attempting a
// content-serving action - used on tab open and by the client's own
// inactivity timer to decide whether to show the re-auth modal. This is
// a convenience check only; every real Vault route (list/upload/
// download/delete) independently re-verifies the same cookie itself,
// since that's the actual security boundary, not this endpoint.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { resolveVaultUnlock } from "@/lib/tracker/vaultSession";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const raw = await resolveVaultUnlock(request, session.email);
  return NextResponse.json({ unlocked: !!raw });
}
