// Place at: src/app/api/tomasz/assistant-questions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { deleteAssistantQuestions } from "@/lib/tracker/assistantQuestionLog";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Not signed in as admin." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { ids } = body as { ids?: string[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "No questions selected." }, { status: 400 });
  }

  try {
    const deletedCount = await deleteAssistantQuestions(ids);
    return NextResponse.json({ ok: true, deletedCount });
  } catch (err) {
    console.error("Failed to bulk-delete assistant questions:", err);
    return NextResponse.json({ error: "Could not delete." }, { status: 500 });
  }
}
