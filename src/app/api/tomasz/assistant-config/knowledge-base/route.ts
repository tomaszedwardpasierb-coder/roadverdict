// Place at: src/app/api/tomasz/assistant-config/knowledge-base/route.ts
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { updateKnowledgeBase } from "@/lib/tracker/assistantConfig";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof body.content !== "string" || body.content.trim().length === 0) {
    return NextResponse.json({ error: "Content cannot be empty." }, { status: 400 });
  }

  try {
    await updateKnowledgeBase(body.content);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to update knowledge base:", err);
    return NextResponse.json({ error: "Failed to save." }, { status: 500 });
  }
}
