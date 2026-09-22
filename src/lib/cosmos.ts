// Place at: src/lib/cosmos.ts
// Hard guardrail: throws a build error naming the exact import chain if
// any client component ever transitively imports this file again - see
// proPlan.ts/onboardingSteps.ts's own comments for the leaks this caught
// before this guard existed (Azure Cosmos SDK shipped to the browser).
import "server-only";
import { CosmosClient, Container } from "@azure/cosmos";

let containerInstance: Container | null = null;

// Lazily creates the Cosmos client on first real use, rather than at
// import time. Next.js inspects route modules during `next build` even
// when a route is never actually called - if this threw immediately at
// import time, every build (including in CI, where this env var isn't
// set) would fail, even though the connection is only needed at request time.
export function getContainer(): Container {
  if (containerInstance) return containerInstance;

  const connectionString = process.env.COSMOS_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("Missing COSMOS_CONNECTION_STRING environment variable");
  }

  const client = new CosmosClient(connectionString);
  const database = client.database("roadverdict");
  containerInstance = database.container("app");
  return containerInstance;
}
