// Place at: tests/integration/testCosmos.ts
//
// Shared helpers for integration tests that talk to the real (emulator)
// Cosmos container - not a mock. Every test that writes data must clean
// up its own partition afterward so repeated local runs don't pile up
// stale docs in the emulator's on-disk store indefinitely.
import { getContainer } from "@/lib/cosmos";

// A fresh, collision-free partition key for one test - using a real
// email shape since every doc's pk IS the owner's email in production,
// and some queries/validation elsewhere assume that shape.
export function testPk(label: string): string {
  return `integration-test+${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

// Deletes every doc in the given partition. Call from an afterEach (not
// afterAll) so a failing test doesn't leak docs into the next one's run.
export async function cleanupPartition(pk: string): Promise<void> {
  const container = getContainer();
  const { resources } = await container.items
    .query<{ id: string }>({ query: "SELECT c.id FROM c" }, { partitionKey: pk })
    .fetchAll();
  await Promise.all(resources.map((doc) => container.item(doc.id, pk).delete().catch(() => {})));
}
