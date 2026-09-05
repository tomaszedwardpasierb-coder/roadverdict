// Place at: src/app/api/tracker/share-link/[token]/asking-price/route.ts
//
// Separate from the create route since this edits a link that already
// exists - the seller's asking price genuinely changes during a sale,
// so this needs to be callable any time after creation, not just once.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getShareLink, updateShareLinkAskingPrice } from "@/lib/tracker/shareLink";

export const dynamic = "force-dynamic";

const MAX_ASKING_PRICE = 200000;

export async function POST(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // 404 for both "doesn't exist" and "exists but isn't yours" - never
  // confirms to a caller which one it is, so knowing a token alone
  // can't be used to probe for or edit someone else's link.
  const link = await getShareLink(params.token);
  if (!link || link.email !== session.email) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { askingPrice } = body as { askingPrice?: number | null };

  // null (or omitted) clears a previously-set price - the seller
  // removing it entirely is just as valid an action as setting one.
  let validated: number | null = null;
  if (askingPrice !== undefined && askingPrice !== null) {
    if (typeof askingPrice !== "number" || !Number.isFinite(askingPrice) || askingPrice <= 0 || askingPrice > MAX_ASKING_PRICE) {
      return NextResponse.json({ error: "Enter a valid asking price, or clear it." }, { status: 400 });
    }
    validated = askingPrice;
  }

  const updated = await updateShareLinkAskingPrice(params.token, validated);
  if (!updated) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }
  return NextResponse.json({ askingPrice: updated.askingPrice ?? null });
}