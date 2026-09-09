// Place at: src/app/api/cars/car-share-link/[token]/asking-price/route.ts
// Car mirror of api/tracker/share-link/[token]/asking-price/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCarShareLink, updateCarShareLinkAskingPrice } from "@/lib/tracker/carShareLink";
import { logImpersonationActivityForCurrentRequest } from "@/lib/admin/impersonation";

export const dynamic = "force-dynamic";

const MAX_ASKING_PRICE = 200000;

export async function POST(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const link = await getCarShareLink(params.token);
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

  let validated: number | null = null;
  if (askingPrice !== undefined && askingPrice !== null) {
    if (typeof askingPrice !== "number" || !Number.isFinite(askingPrice) || askingPrice <= 0 || askingPrice > MAX_ASKING_PRICE) {
      return NextResponse.json({ error: "Enter a valid asking price, or clear it." }, { status: 400 });
    }
    validated = askingPrice;
  }

  const updated = await updateCarShareLinkAskingPrice(params.token, validated);
  if (!updated) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }
  void logImpersonationActivityForCurrentRequest("carShareLink", params.token, "update");
  return NextResponse.json({ askingPrice: updated.askingPrice ?? null });
}
