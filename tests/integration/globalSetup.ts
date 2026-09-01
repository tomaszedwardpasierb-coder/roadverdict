// Place at: tests/integration/globalSetup.ts
//
// Runs once, in vitest's main process, before any integration test file
// is loaded. Points the app's real (unmocked) Cosmos client at the local
// Azure Cosmos DB Emulator instead of production, and makes sure the
// "roadverdict" database / "app" container exist with the same partition
// key (/pk) production uses - so every integration test exercises the
// actual @azure/cosmos wiring (queries, partition keys, upserts) rather
// than a mock's idea of how Cosmos behaves.
//
// Requires the emulator to already be running (native Windows install:
// "C:\Program Files\Azure Cosmos DB Emulator\CosmosDB.Emulator.exe" /NoUI
// - see TESTING.md). This file does not start it - first-run
// initialization alone can take several minutes, far longer than any
// sane per-test-run setup timeout should wait.
import { CosmosClient } from "@azure/cosmos";

// The well-known, publicly-documented default emulator key - identical
// on every machine's local emulator instance, not a secret. See
// https://learn.microsoft.com/azure/cosmos-db/emulator#authentication
const EMULATOR_CONNECTION_STRING =
  "AccountEndpoint=https://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==;";

export default async function setup() {
  // The emulator's TLS certificate is self-signed and machine-specific -
  // acceptable to disable verification for this one local, test-only
  // process, never in anything that talks to production.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  process.env.COSMOS_CONNECTION_STRING = EMULATOR_CONNECTION_STRING;

  const client = new CosmosClient(EMULATOR_CONNECTION_STRING);

  try {
    await client.getDatabaseAccount();
  } catch (err) {
    throw new Error(
      "Cosmos DB Emulator isn't reachable at https://localhost:8081/. " +
        "Start it first (see TESTING.md's Integration tests section), then re-run npm run test:integration.\n" +
        (err instanceof Error ? err.message : String(err))
    );
  }

  const { database } = await client.databases.createIfNotExists({ id: "roadverdict" });
  await database.containers.createIfNotExists({ id: "app", partitionKey: { paths: ["/pk"] } });
}
