// Place at: src/app/api/vault/lock/route.ts
//
// Manual "lock the Vault now" - the same pattern a banking app or
// password manager offers alongside its automatic timeout. Idempotent:
// locking an already-locked session (no cookie, or an expired one) is a
// harmless no-op, never an error.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { resolveVaultUnlock, clearVaultSession, VAULT_SESSION_COOKIE_NAME } from "@/lib/tracker/vaultSession";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const raw = await resolveVaultUnlock(request, session.email);
  if (raw) await clearVaultSession(session.email, raw);

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(VAULT_SESSION_COOKIE_NAME);
  return response;
}
