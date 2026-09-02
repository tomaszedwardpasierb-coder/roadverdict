// Place at: tests/integration/globalSetup.ts
//
// Runs once, in vitest's main process, before any integration test file
// is loaded. Points the app's real (unmocked) Cosmos client at one of
// two places, and makes sure the "roadverdict" database / "app"
// container exist there with the same partition key (/pk) production
// uses - so every integration test exercises the actual @azure/cosmos
// wiring (queries, partition keys, upserts) rather than a mock's idea
// of how Cosmos behaves:
//
// - COSMOS_TEST_CONNECTION_STRING, if set (CI): a real, dedicated
//   test-only Azure Cosmos DB account. Preferred whenever it's
//   available - the local Cosmos DB Emulator's Linux/Docker image has
//   a real, unresolved upstream crash bug under write load that
//   repeatedly took CI down; a real Cosmos DB account doesn't have it.
// - Otherwise (local development): the local Azure Cosmos DB Emulator,
//   which this file does not start - first-run initialization alone
//   can take several minutes, far longer than any sane per-test-run
//   setup timeout should wait. Start it first (native Windows install:
//   "C:\Program Files\Azure Cosmos DB Emulator\CosmosDB.Emulator.exe"
//   /NoUI - see TESTING.md).
import { CosmosClient } from "@azure/cosmos";

// The well-known, publicly-documented default emulator key - identical
// on every machine's local emulator instance, not a secret. See
// https://learn.microsoft.com/azure/cosmos-db/emulator#authentication
const EMULATOR_CONNECTION_STRING =
  "AccountEndpoint=https://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==;";

export default async function setup() {
  const testAccountConnectionString = process.env.COSMOS_TEST_CONNECTION_STRING;
  const usingRealTestAccount = !!testAccountConnectionString;

  // Only the emulator's self-signed, machine-specific certificate needs
  // this - a real Azure Cosmos DB endpoint has a properly CA-signed
  // one, and disabling verification against a real, internet-facing
  // endpoint would be a genuine security downgrade, not a harmless
  // local convenience.
  if (!usingRealTestAccount) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  const connectionString = testAccountConnectionString || EMULATOR_CONNECTION_STRING;
  process.env.COSMOS_CONNECTION_STRING = connectionString;

  const client = new CosmosClient(connectionString);

  try {
    await client.getDatabaseAccount();
  } catch (err) {
    throw new Error(
      (usingRealTestAccount
        ? "Could not reach the real test Cosmos DB account at COSMOS_TEST_CONNECTION_STRING. "
        : "Cosmos DB Emulator isn't reachable at https://localhost:8081/. " +
          "Start it first (see TESTING.md's Integration tests section), then re-run npm run test:integration.\n") +
        (err instanceof Error ? err.message : String(err))
    );
  }

  const { database } = await client.databases.createIfNotExists({ id: "roadverdict" });
  await database.containers.createIfNotExists({ id: "app", partitionKey: { paths: ["/pk"] } });
}
