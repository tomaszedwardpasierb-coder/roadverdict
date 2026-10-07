// Place at: src/app/api/tomasz/accounts/tags/route.ts
//
// Adds or removes an admin-only label (e.g. "tester") on one or more
// accounts - the bulk bar in /tomasz's All accounts.
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { isAccountTag, setAccountTag } from "@/lib/tracker/userAccount";

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
  const { emails, tag, on } = body as { emails?: unknown; tag?: unknown; on?: unknown };
  if (!Array.isArray(emails) || emails.length === 0 || emails.length > MAX_EMAILS || !emails.every((e) => typeof e === "string" && e.trim())) {
    return NextResponse.json({ error: "Choose at least one account." }, { status: 400 });
  }
  if (!isAccountTag(tag) || typeof on !== "boolean") {
    return NextResponse.json({ error: "Unknown tag." }, { status: 400 });
  }

  let updated = 0;
  const failed: string[] = [];
  for (const raw of emails as string[]) {
    const email = raw.trim().toLowerCase();
    try {
      await setAccountTag(email, tag, on);
      updated++;
    } catch {
      failed.push(email);
    }
  }
  return NextResponse.json({ ok: true, updated, failed });
}
