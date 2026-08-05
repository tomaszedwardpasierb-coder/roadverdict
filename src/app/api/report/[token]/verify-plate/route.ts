// Place at: src/app/api/report/[token]/verify-plate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyPlate, grantReportAccess, checkPlateRateLimit, recordPlateAttempt } from "@/lib/tracker/reportAccess";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { allowed } = await checkPlateRateLimit(params.token);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a few minutes and try again." },
      { status: 429 }
    );
  }

  let body: { plate?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.plate || typeof body.plate !== "string") {
    return NextResponse.json({ error: "Please enter the registration number." }, { status: 400 });
  }

  await recordPlateAttempt(params.token);
  const correct = await verifyPlate(params.token, body.plate);
  if (!correct) {
    return NextResponse.json({ error: "That doesn't match this bike's registration. Please check and try again." }, { status: 403 });
  }

  const { cookieName, cookieValue, maxAge } = await grantReportAccess(params.token);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookieName, cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge,
    path: `/report/${params.token}`,
  });
  return response;
}
