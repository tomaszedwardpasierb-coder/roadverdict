// Place at: src/app/api/tomasz/accounts/vehicle-allowance/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { setVehicleAllowance } from "@/lib/tracker/userAccount";

export const dynamic = "force-dynamic";

// Sets (or, with allowance: null, clears) how many vehicles one account
// may track - for an owner paying for extra vehicles. The range check
// lives in setVehicleAllowance() itself, not here.
export async function POST(request: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Not signed in as admin." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { email, allowance } = (body ?? {}) as { email?: unknown; allowance?: unknown };
  if (typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  if (allowance !== null && typeof allowance !== "number") {
    return NextResponse.json({ error: "Allowance must be a number, or null to clear it." }, { status: 400 });
  }

  try {
    await setVehicleAllowance(email.trim().toLowerCase(), allowance);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not update the allowance." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
