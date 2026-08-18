// Place at: src/app/api/tracker/bike/[bikeId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getBikesForUser, deleteBike, isBikeReadOnly, BIKE_READ_ONLY_MESSAGE } from "@/lib/tracker/bike";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, { params }: { params: { bikeId: string } }) {
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
  // A transferred bike is read-only - deleting it would leave the new
  // owner's copy pointing back at nothing, breaking the ownership chain.
  if (isBikeReadOnly(bike)) {
    return NextResponse.json({ error: BIKE_READ_ONLY_MESSAGE }, { status: 403 });
  }

  await deleteBike(session.email, bikeId);
  return NextResponse.json({ ok: true });
}
