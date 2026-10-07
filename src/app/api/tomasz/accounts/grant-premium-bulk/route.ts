// Place at: src/app/api/tomasz/accounts/grant-premium-bulk/route.ts
//
// "Give Pro until..." for several accounts at once - testers and friends.
// Paying Stripe subscribers and longer grants are left exactly as they are
// (see grantPremiumUnlessPaying).
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { grantPremiumUnlessPaying, MAX_GRANT_YEARS, type BulkGrantOutcome } from "@/lib/tracker/userAccount";

export const dynamic = "force-dynamic";

const MAX_EMAILS = 500;

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Not signed in as admin." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { emails, expiresAt } = body as { emails?: unknown; expiresAt?: unknown };
  if (!Array.isArray(emails) || emails.length === 0 || emails.length > MAX_EMAILS || !emails.every((e) => typeof e === "string" && e.trim())) {
    return NextResponse.json({ error: "Choose at least one account." }, { status: 400 });
  }
  const until = typeof expiresAt === "string" ? new Date(expiresAt) : null;
  const maxUntil = new Date();
  maxUntil.setFullYear(maxUntil.getFullYear() + MAX_GRANT_YEARS);
  if (!until || !Number.isFinite(until.getTime()) || until.getTime() <= Date.now() || until > maxUntil) {
    return NextResponse.json({ error: "Choose an end date in the future." }, { status: 400 });
  }

  const counts: Record<BulkGrantOutcome | "failed", number> = { granted: 0, paying: 0, "already-longer": 0, "no-account": 0, failed: 0 };
  for (const raw of emails as string[]) {
    try {
      counts[await grantPremiumUnlessPaying(raw.trim().toLowerCase(), until.toISOString())]++;
    } catch {
      counts.failed++;
    }
  }
  return NextResponse.json({ ok: true, ...counts });
}
