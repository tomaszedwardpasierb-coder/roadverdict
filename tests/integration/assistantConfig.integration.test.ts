// Place at: tests/integration/assistantConfig.integration.test.ts
//
// Exercises pruneKnowledgeBaseVersions/prunePersonalityVersions
// (src/lib/tracker/assistantConfig.ts) against the real Cosmos DB
// Emulator - the OFFSET/LIMIT pagination these use to implement "keep
// the most recent N" is exactly the kind of real-query-engine
// behaviour a mocked container can't prove.
//
// Unlike most other integration suites, these doc types share one
// FIXED partition ("system") rather than a fresh one per test - the
// real, live assistantConfig singleton and any genuine version history
// already in this Cosmos account live there too. So this file never
// asserts on a global count or blanket-deletes the partition; fixture
// docs are timestamped far in the future (year 2099) so they always
// rank above anything real, making this test's own boundary
// self-contained regardless of what else exists in "system" - and
// every fixture id is tracked and deleted individually afterward.
import { afterEach, describe, expect, it } from "vitest";
import { getContainer } from "@/lib/cosmos";
import { pruneKnowledgeBaseVersions, prunePersonalityVersions } from "@/lib/tracker/assistantConfig";

const SYSTEM_PK = "system";
const FAR_FUTURE_MS = new Date("2099-01-01T00:00:00.000Z").getTime();

async function createVersionDoc(type: "knowledgeBaseVersion" | "personalityVersion", offsetMs: number): Promise<string> {
  const container = getContainer();
  const id = `${type}-integration-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const savedAt = new Date(FAR_FUTURE_MS + offsetMs).toISOString();
  const base = { id, pk: SYSTEM_PK, type, savedAt };
  const doc =
    type === "knowledgeBaseVersion"
      ? { ...base, content: "integration test content" }
      : { ...base, personalityEnabled: false, activePersonalityId: null, personalities: [] };
  await container.items.create(doc);
  return id;
}

describe("assistantConfig version pruning against a real Cosmos container (emulator)", () => {
  let createdIds: string[];

  afterEach(async () => {
    const container = getContainer();
    await Promise.all(createdIds.map((id) => container.item(id, SYSTEM_PK).delete().catch(() => {})));
  });

  it("pruneKnowledgeBaseVersions deletes exactly the two oldest of 52 fixtures, keeping the newest 50", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 52; i++) {
      ids.push(await createVersionDoc("knowledgeBaseVersion", i));
    }
    createdIds = ids;

    await pruneKnowledgeBaseVersions();

    const container = getContainer();
    const stillThere = await Promise.all(
      ids.map(async (id) => {
        const { resource } = await container.item(id, SYSTEM_PK).read();
        return !!resource;
      })
    );
    // ids[] was created oldest (offset 0) to newest (offset 51) - the
    // two oldest must be gone, the 50 newest must all survive.
    expect(stillThere[0]).toBe(false);
    expect(stillThere[1]).toBe(false);
    expect(stillThere.slice(2)).toEqual(new Array(50).fill(true));
  });

  it("prunePersonalityVersions deletes nothing when under the retention threshold", async () => {
    const id = await createVersionDoc("personalityVersion", 0);
    createdIds = [id];

    await prunePersonalityVersions();

    const container = getContainer();
    const { resource } = await container.item(id, SYSTEM_PK).read();
    expect(resource).toBeDefined();
  });
});
