// Place at: src/app/api/account/trusted-devices/[id]/route.ts
//
// Stops a phone opening the Vault with its fingerprint, face or PIN - it's
// back to an authenticator code there. Only ever the signed-in owner's own
// phones: the lookup is inside their own partition.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { removeTrustedDevice } from "@/lib/auth/trustedDevice";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  const removed = await removeTrustedDevice(session.email, id);
  if (!removed) return NextResponse.json({ error: "That phone isn't on your list." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
