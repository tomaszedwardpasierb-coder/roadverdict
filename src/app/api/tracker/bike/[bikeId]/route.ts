// Place at: src/app/api/tracker/bike/[bikeId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getBikesForUser, deleteBike } from "@/lib/tracker/bike";
import { logImpersonationActivityForCurrentRequest } from "@/lib/admin/impersonation";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, props: { params: Promise<{ bikeId: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const bikeId = decodeURIComponent(params.bikeId);

  // Confirm this bike actually belongs to the signed-in account before
  // deleting anything - same check used when switching active bike.
  const bikes = await getBikesForUser(session.email);
  const bike = bikes.find((b) => b.id === bikeId);
  if (!bike) {
    return NextResponse.json({ error: "Bike not found on this account." }, { status: 404 });
  }
  // A transferred (read-only) bike can be deleted too - it's this
  // owner's own historical copy. The new owner's copy never reads it
  // (transferredFrom keeps its own frozen summary), and deleteBike only
  // removes receipt files no other record still uses, so the new owner's
  // copied records keep theirs.

  await deleteBike(session.email, bikeId);
  void logImpersonationActivityForCurrentRequest("bike", bikeId, "delete");
  return NextResponse.json({ ok: true });
}
