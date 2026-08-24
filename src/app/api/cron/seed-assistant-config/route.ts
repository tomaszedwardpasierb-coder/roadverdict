// Place at: src/app/api/cron/seed-assistant-config/route.ts
//
// One-time migration: creates the live assistantConfig document (see
// assistantConfig.ts) the assistant route now reads on every request,
// seeded from the knowledge base text still kept in
// assistantKnowledge.ts. Idempotent by design - if the config already
// exists, this does nothing and reports that back, so it's always safe
// to click more than once, matching every other migration on this
// page.
import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { ASSISTANT_KNOWLEDGE_BASE } from "@/lib/tracker/assistantKnowledge";
import { getAssistantConfig, type AssistantConfigDoc, type KnowledgeBaseVersionDoc } from "@/lib/tracker/assistantConfig";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const existing = await getAssistantConfig();
    if (existing) {
      return NextResponse.json({ ok: true, alreadySeeded: true });
    }

    const container = getContainer();
    const now = new Date().toISOString();

    const config: AssistantConfigDoc = {
      id: "assistantConfig",
      pk: "system",
      type: "assistantConfig",
      knowledgeBase: ASSISTANT_KNOWLEDGE_BASE,
      personalityEnabled: false,
      activePersonalityId: null,
      // Empty on purpose - nothing to seed these from, since this is a
      // genuinely new concept, not something that existed in any form
      // before. Written and named by hand from /tomasz once this ships.
      personalities: [
        { id: "1", name: "", body: "" },
        { id: "2", name: "", body: "" },
        { id: "3", name: "", body: "" },
      ],
      knowledgeBaseUpdatedAt: now,
      personalityUpdatedAt: now,
    };
    await container.items.create(config);

    const version: KnowledgeBaseVersionDoc = {
      id: `kbVersion::${Date.now()}::seed`,
      pk: "system",
      type: "knowledgeBaseVersion",
      content: ASSISTANT_KNOWLEDGE_BASE,
      savedAt: now,
    };
    await container.items.create(version);

    await container.items.upsert({
      id: "cronStatus::seedAssistantConfig",
      pk: "system",
      type: "cronStatus",
      lastRunAt: now,
    });

    return NextResponse.json({ ok: true, alreadySeeded: false });
  } catch (err) {
    return NextResponse.json(
      { error: "Unexpected error seeding assistant config", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
