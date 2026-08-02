// Place at: src/lib/blobStorage.ts
import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";

let containerClientInstance: ContainerClient | null = null;

// Receipts/invoices only. Kept as one constant here (not an env var) - same
// pattern as the Cosmos database/container names in cosmos.ts.
const CONTAINER_NAME = "attachments";

// Lazily creates the client on first real use, same reasoning as
// getContainer() in cosmos.ts: Next.js inspects route modules during
// `next build` even when a route is never called, and doing this at
// import time would fail every build where the env var isn't set (e.g. CI).
export async function getAttachmentContainer(): Promise<ContainerClient> {
  if (containerClientInstance) return containerClientInstance;

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("Missing AZURE_STORAGE_CONNECTION_STRING environment variable");
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const container = blobServiceClient.getContainerClient(CONTAINER_NAME);

  // Deliberately no `access` option here, which defaults to fully private -
  // nobody can read a blob's URL directly without going through our own
  // authenticated /api/tracker/attachment/[blobName] route. This also means
  // nothing depends on the storage account's "allow public blob access"
  // setting, which some accounts have disabled by default - we never need it.
  await container.createIfNotExists();

  containerClientInstance = container;
  return container;
}
