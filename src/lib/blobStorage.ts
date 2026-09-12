// Place at: src/lib/blobStorage.ts
import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";

let containerClientInstance: ContainerClient | null = null;
let vaultContainerClientInstance: ContainerClient | null = null;

// Receipts/invoices, and (since the Settings-tab profile feature)
// account avatars too - blob names are already unguessable and unrelated
// to what they contain, so sharing one container isn't a functional
// problem, just a name that's slightly wider than it once was. Kept as
// one constant here (not an env var) - same pattern as the Cosmos
// database/container names in cosmos.ts.
const CONTAINER_NAME = "attachments";

// The Vault's documents (V5C, insurance, licences etc) are kept in their
// own container, isolated from ordinary receipt attachments - not for a
// technical reason (blob names are unguessable either way, same as the
// comment above), but because the Vault carries identity-adjacent
// documents and deserves a storage boundary of its own rather than
// sharing a container whose name and history predate it.
const VAULT_CONTAINER_NAME = "vault-documents";

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

export async function getVaultContainer(): Promise<ContainerClient> {
  if (vaultContainerClientInstance) return vaultContainerClientInstance;

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("Missing AZURE_STORAGE_CONNECTION_STRING environment variable");
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const container = blobServiceClient.getContainerClient(VAULT_CONTAINER_NAME);

  // Same "fully private, always proxied through our own authenticated
  // route" posture as getAttachmentContainer() above - no SAS URLs are
  // ever generated for Vault documents either.
  await container.createIfNotExists();

  vaultContainerClientInstance = container;
  return container;
}
