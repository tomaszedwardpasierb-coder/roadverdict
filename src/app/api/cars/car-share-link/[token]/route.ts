// Place at: src/app/api/cars/car-share-link/[token]/route.ts
// Car mirror of api/tracker/share-link/[token]/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCarShareLink, deleteCarShareLink } from "@/lib/tracker/carShareLink";
import { logImpersonationActivityForCurrentRequest } from "@/lib/admin/impersonation";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const link = await getCarShareLink(params.token);
  if (!link || link.email !== session.email) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }

  await deleteCarShareLink(params.token);
  void logImpersonationActivityForCurrentRequest("carShareLink", params.token, "delete");
  return NextResponse.json({ ok: true });
}
