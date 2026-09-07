// Place at: src/app/api/tomasz/assistant-config/car-knowledge-base/versions/route.ts
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { getCarKnowledgeBaseVersions } from "@/lib/tracker/assistantConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    const versions = await getCarKnowledgeBaseVersions();
    return NextResponse.json({ versions });
  } catch (err) {
    console.error("Failed to load car knowledge base versions:", err);
    return NextResponse.json({ error: "Failed to load versions." }, { status: 500 });
  }
}
