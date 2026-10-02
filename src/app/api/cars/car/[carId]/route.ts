// Place at: src/app/api/cars/car/[carId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCarsForUser, deleteCar } from "@/lib/tracker/car";
import { logImpersonationActivityForCurrentRequest } from "@/lib/admin/impersonation";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, props: { params: Promise<{ carId: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const carId = decodeURIComponent(params.carId);

  // Confirm this car actually belongs to the signed-in account before
  // deleting anything - same check used when switching active car.
  const cars = await getCarsForUser(session.email);
  const car = cars.find((c) => c.id === carId);
  if (!car) {
    return NextResponse.json({ error: "Car not found on this account." }, { status: 404 });
  }
  // A transferred (read-only) car can be deleted too - see the bike
  // route's DELETE for why that's safe for the new owner's copy.

  await deleteCar(session.email, carId);
  void logImpersonationActivityForCurrentRequest("car", carId, "delete");
  return NextResponse.json({ ok: true });
}
