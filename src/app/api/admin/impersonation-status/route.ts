// Place at: src/app/api/admin/impersonation-status/route.ts
//
// Replaces the cookies()/getAdminSession() read the root layout used to do
// on every request to decide whether to show the admin impersonation
// banner - that read made every page in the app render per request. The
// layout is now cookie-free; a tiny client component asks this route
// instead, and only when the (non-secret) rv_imp marker cookie says an
// impersonation cookie exists at all.
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const impersonatingEmail = request.cookies.get("impersonating_as")?.value ?? null;
  // Same rule the layout applied: the impersonation cookie alone is never
  // sufficient - a real admin session must ALSO be currently valid.
  const isAdmin = impersonatingEmail ? await getAdminSession() : false;
  return NextResponse.json(
    { email: isAdmin ? impersonatingEmail : null },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
