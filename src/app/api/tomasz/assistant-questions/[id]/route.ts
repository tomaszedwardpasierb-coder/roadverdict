// Place at: src/app/api/tomasz/assistant-questions/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { deleteAssistantQuestion } from "@/lib/tracker/assistantQuestionLog";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Not signed in as admin." }, { status: 401 });
  }

  try {
    await deleteAssistantQuestion(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to delete assistant question:", err);
    return NextResponse.json({ error: "Could not delete." }, { status: 500 });
  }
}
