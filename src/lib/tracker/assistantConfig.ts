// Place at: src/lib/tracker/assistantConfig.ts
//
// Moves the assistant's knowledge base and personality settings from
// hardcoded source (assistantKnowledge.ts) to a single, admin-editable
// database document - see /tomasz. This is the live config read on
// every assistant request, so it's kept as one fast point-read rather
// than reconstructed from history each time.
//
// Version history is tracked separately per field (knowledgeBase vs
// personalities), as its own append-only document type - each save
// writes a new snapshot of what was just saved, so the history reads
// like a normal chronology (including the current state as its own
// most recent entry) rather than "what it used to be before this
// edit". Reverting is just saving an old snapshot's content again
// through the same update functions below, not a separate code path.
import { getContainer } from "@/lib/cosmos";

export interface PersonalitySlot {
  id: "1" | "2" | "3";
  name: string;
  body: string;
}

export interface AssistantConfigDoc {
  id: "assistantConfig";
  pk: "system";
  type: "assistantConfig";
  knowledgeBase: string;
  personalityEnabled: boolean;
  activePersonalityId: "1" | "2" | "3" | null;
  // Always exactly three - enforced at the type level as a tuple, not
  // just a convention, matching the fixed three writable slots this
  // was asked for.
  personalities: [PersonalitySlot, PersonalitySlot, PersonalitySlot];
  knowledgeBaseUpdatedAt: string;
  personalityUpdatedAt: string;
}

export interface KnowledgeBaseVersionDoc {
  id: string;
  pk: "system";
  type: "knowledgeBaseVersion";
  content: string;
  savedAt: string;
}

export interface PersonalityVersionDoc {
  id: string;
  pk: "system";
  type: "personalityVersion";
  personalityEnabled: boolean;
  activePersonalityId: "1" | "2" | "3" | null;
  personalities: [PersonalitySlot, PersonalitySlot, PersonalitySlot];
  savedAt: string;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

export async function getAssistantConfig(): Promise<AssistantConfigDoc | null> {
  const container = getContainer();
  try {
    const { resource } = await container.item("assistantConfig", "system").read<AssistantConfigDoc>();
    return resource ?? null;
  } catch {
    return null;
  }
}

export async function updateKnowledgeBase(newContent: string): Promise<void> {
  const container = getContainer();
  const now = new Date().toISOString();

  const existing = await getAssistantConfig();
  if (!existing) {
    throw new Error("Cannot update knowledge base - no assistant config exists yet. Run the seed migration first.");
  }

  const updated: AssistantConfigDoc = {
    ...existing,
    knowledgeBase: newContent,
    knowledgeBaseUpdatedAt: now,
  };
  await container.items.upsert(updated);

  const version: KnowledgeBaseVersionDoc = {
    id: `kbVersion::${Date.now()}::${randomSuffix()}`,
    pk: "system",
    type: "knowledgeBaseVersion",
    content: newContent,
    savedAt: now,
  };
  await container.items.create(version);
}

export async function updatePersonalityConfig(
  enabled: boolean,
  activeId: "1" | "2" | "3" | null,
  personalities: [PersonalitySlot, PersonalitySlot, PersonalitySlot]
): Promise<void> {
  const container = getContainer();
  const now = new Date().toISOString();

  const existing = await getAssistantConfig();
  if (!existing) {
    throw new Error("Cannot update personality config - no assistant config exists yet. Run the seed migration first.");
  }

  const updated: AssistantConfigDoc = {
    ...existing,
    personalityEnabled: enabled,
    activePersonalityId: activeId,
    personalities,
    personalityUpdatedAt: now,
  };
  await container.items.upsert(updated);

  const version: PersonalityVersionDoc = {
    id: `personalityVersion::${Date.now()}::${randomSuffix()}`,
    pk: "system",
    type: "personalityVersion",
    personalityEnabled: enabled,
    activePersonalityId: activeId,
    personalities,
    savedAt: now,
  };
  await container.items.create(version);
}

export async function getKnowledgeBaseVersions(limit = 20): Promise<KnowledgeBaseVersionDoc[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<KnowledgeBaseVersionDoc>(
      {
        query: "SELECT * FROM c WHERE c.type = 'knowledgeBaseVersion' ORDER BY c.savedAt DESC OFFSET 0 LIMIT @limit",
        parameters: [{ name: "@limit", value: limit }],
      },
      { partitionKey: "system" }
    )
    .fetchAll();
  return resources;
}

export async function getPersonalityVersions(limit = 20): Promise<PersonalityVersionDoc[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<PersonalityVersionDoc>(
      {
        query: "SELECT * FROM c WHERE c.type = 'personalityVersion' ORDER BY c.savedAt DESC OFFSET 0 LIMIT @limit",
        parameters: [{ name: "@limit", value: limit }],
      },
      { partitionKey: "system" }
    )
    .fetchAll();
  return resources;
}

// Append-only version history has no natural expiry by age - a
// knowledge base or personality config that's rarely edited should
// still keep its whole history, however old. Retention here is by
// count instead, same idea most version-history systems use: keep the
// most recent MAX_VERSIONS_KEPT snapshots, drop anything older.
const MAX_VERSIONS_KEPT = 50;

export async function pruneKnowledgeBaseVersions(): Promise<number> {
  const container = getContainer();
  const { resources } = await container.items
    .query<{ id: string }>(
      {
        query: "SELECT c.id FROM c WHERE c.type = 'knowledgeBaseVersion' ORDER BY c.savedAt DESC OFFSET @keep LIMIT 10000",
        parameters: [{ name: "@keep", value: MAX_VERSIONS_KEPT }],
      },
      { partitionKey: "system" }
    )
    .fetchAll();
  const results = await Promise.allSettled(resources.map((r) => container.item(r.id, "system").delete()));
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.error(`pruneKnowledgeBaseVersions: ${failures.length} of ${resources.length} failed to delete:`, failures);
  }
  return results.filter((r) => r.status === "fulfilled").length;
}

export async function prunePersonalityVersions(): Promise<number> {
  const container = getContainer();
  const { resources } = await container.items
    .query<{ id: string }>(
      {
        query: "SELECT c.id FROM c WHERE c.type = 'personalityVersion' ORDER BY c.savedAt DESC OFFSET @keep LIMIT 10000",
        parameters: [{ name: "@keep", value: MAX_VERSIONS_KEPT }],
      },
      { partitionKey: "system" }
    )
    .fetchAll();
  const results = await Promise.allSettled(resources.map((r) => container.item(r.id, "system").delete()));
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.error(`prunePersonalityVersions: ${failures.length} of ${resources.length} failed to delete:`, failures);
  }
  return results.filter((r) => r.status === "fulfilled").length;
}
