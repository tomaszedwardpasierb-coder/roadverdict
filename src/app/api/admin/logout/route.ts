// Place at: src/app/api/admin/logout/route.ts
import { NextResponse } from "next/server";
import { deleteAdminSession } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

export async function POST() {
  await deleteAdminSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("admin_session");
  return response;
}
