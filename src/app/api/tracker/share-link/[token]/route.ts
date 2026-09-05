// Place at: src/app/api/tracker/share-link/[token]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getShareLink, deleteShareLink } from "@/lib/tracker/shareLink";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const link = await getShareLink(params.token);
  if (!link || link.email !== session.email) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }

  await deleteShareLink(params.token);
  return NextResponse.json({ ok: true });
}
