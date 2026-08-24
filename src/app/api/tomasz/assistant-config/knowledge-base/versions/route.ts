// Place at: src/app/api/tomasz/assistant-config/knowledge-base/versions/route.ts
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { getKnowledgeBaseVersions } from "@/lib/tracker/assistantConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    const versions = await getKnowledgeBaseVersions();
    return NextResponse.json({ versions });
  } catch (err) {
    console.error("Failed to load knowledge base versions:", err);
    return NextResponse.json({ error: "Failed to load versions." }, { status: 500 });
  }
}
