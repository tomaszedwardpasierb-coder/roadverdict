// Place at: src/app/api/tracker/share-link/[token]/extend/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getShareLink, extendShareLink, type ShareLinkDuration } from "@/lib/tracker/shareLink";

export const dynamic = "force-dynamic";

const VALID_DURATIONS: ShareLinkDuration[] = ["1week", "1month", "6months"];

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { duration } = body as { duration?: ShareLinkDuration };
  if (!duration || !VALID_DURATIONS.includes(duration)) {
    return NextResponse.json({ error: "Please choose how long to extend this link by." }, { status: 400 });
  }

  const link = await getShareLink(params.token);
  if (!link || link.email !== session.email) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }

  const updated = await extendShareLink(params.token, duration);
  return NextResponse.json({ link: updated });
}
