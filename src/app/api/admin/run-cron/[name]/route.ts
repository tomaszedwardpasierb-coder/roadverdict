// Place at: src/app/api/admin/run-cron/[name]/route.ts
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

const VALID_NAMES = new Set(["update-fuel-price", "check-reminders", "backfill-bike-id"]);

export async function POST(request: Request, { params }: { params: { name: string } }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!VALID_NAMES.has(params.name)) {
    return NextResponse.json({ error: "Unknown cron." }, { status: 400 });
  }

  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  const res = await fetch(`${appUrl}/api/cron/${params.name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
