// Place at: src/lib/tracker/vaultDocument.ts
//
// A Vault document is its own standalone Cosmos record type, not a
// TrackerDocBase (see cosmosHelpers.ts) - TrackerDocBase's bikeId field
// and queryTrackerDocs' bikeId-only query are genuinely bike-specific
// (the car side has its own parallel queryCarTrackerDocs in car.ts for
// the same reason), whereas the Vault is one record type serving both
// vehicle kinds via an explicit vehicleKind/vehicleId pair. Partitioned
// by email like every other doc in this app - ownership is a cheap
// point-read within the caller's own partition, not a cross-record
// ARRAY_CONTAINS query like attachmentOwnership.ts needs (that query
// exists because a receipt's blobName is nested inside another record;
// a Vault document IS the record).
//
// This file itself is server-only (see cosmos.ts/blobStorage.ts's own
// "server-only" guards) - VaultTab.tsx ('use client') needs
// VAULT_CATEGORIES/VaultDocumentCategory, so those two now live in
// vaultCategories.ts instead, re-exported below for any other importer.
import "server-only";
import crypto from "crypto";
import { getContainer } from "@/lib/cosmos";
import { getVaultContainer } from "@/lib/blobStorage";
export type { VaultDocumentCategory } from "@/lib/tracker/vaultCategories";
export { VAULT_CATEGORIES } from "@/lib/tracker/vaultCategories";
import type { VaultDocumentCategory } from "@/lib/tracker/vaultCategories";

const COSMOS_SYSTEM_KEYS = ["_rid", "_self", "_etag", "_attachments", "_ts"] as const;

function stripCosmosMetadata<T extends object>(doc: T): T {
  const clean = { ...doc } as Record<string, unknown>;
  for (const key of COSMOS_SYSTEM_KEYS) delete clean[key];
  return clean as T;
}

export const VAULT_MAX_DOCUMENTS_PER_VEHICLE = 20;
export const VAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const VAULT_MAX_TOTAL_BYTES_PER_VEHICLE = 100 * 1024 * 1024; // 100MB

export interface VaultDocumentDoc {
  id: string;
  pk: string; // email
  type: "vaultDocument";
  vehicleKind: "bike" | "car";
  vehicleId: string;
  blobName: string;
  fileName: string;
  fileType: "application/pdf" | "image/jpeg" | "image/png";
  fileSize: number;
  category: VaultDocumentCategory;
  label?: string;
  uploadedAt: string;
}

export async function createVaultDocument(
  email: string,
  data: {
    vehicleKind: "bike" | "car";
    vehicleId: string;
    blobName: string;
    fileName: string;
    fileType: VaultDocumentDoc["fileType"];
    fileSize: number;
    category: VaultDocumentCategory;
    label?: string;
  }
): Promise<VaultDocumentDoc> {
  const container = getContainer();
  const doc: VaultDocumentDoc = {
    id: `${email}::vaultDocument::${Date.now()}::${crypto.randomBytes(4).toString("hex")}`,
    pk: email,
    type: "vaultDocument",
    uploadedAt: new Date().toISOString(),
    ...data,
  };
  await container.items.upsert(doc);
  return doc;
}

// Cheap point-read, not a search - the id is always known from a prior
// list call before a download/delete is ever requested. email is always
// the authenticated session's own email, never client input, which is
// what makes this ownership check structurally sound: a stranger's
// vaultDocument id simply doesn't exist inside this caller's partition.
export async function getVaultDocument(email: string, id: string): Promise<VaultDocumentDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(id, email).read<VaultDocumentDoc>();
  return resource ? stripCosmosMetadata(resource) : null;
}

export async function getVaultDocumentsForVehicle(email: string, vehicleId: string): Promise<VaultDocumentDoc[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<VaultDocumentDoc>(
      {
        query: "SELECT * FROM c WHERE c.type = 'vaultDocument' AND c.vehicleId = @vehicleId ORDER BY c.uploadedAt DESC",
        parameters: [{ name: "@vehicleId", value: vehicleId }],
      },
      { partitionKey: email }
    )
    .fetchAll();
  return resources.map(stripCosmosMetadata);
}

// Used to enforce the 20-document / 100MB-per-vehicle caps before
// accepting an upload - a single aggregate query rather than fetching
// every document's full body just to sum one field.
export async function countAndSizeVaultDocuments(email: string, vehicleId: string): Promise<{ count: number; totalBytes: number }> {
  const container = getContainer();
  const { resources } = await container.items
    .query<{ fileSize: number }>(
      {
        query: "SELECT c.fileSize FROM c WHERE c.type = 'vaultDocument' AND c.vehicleId = @vehicleId",
        parameters: [{ name: "@vehicleId", value: vehicleId }],
      },
      { partitionKey: email }
    )
    .fetchAll();
  return {
    count: resources.length,
    totalBytes: resources.reduce((sum, r) => sum + r.fileSize, 0),
  };
}

export async function deleteVaultDocument(email: string, id: string): Promise<void> {
  const container = getContainer();
  await container.item(id, email).delete();
}

// Called from deleteBike/deleteCar (bike.ts/car.ts) when a whole vehicle
// is being permanently deleted - unlike deleteVaultDocument above (whose
// blob cleanup is the caller's own responsibility, see
// api/vault/documents/[id]/route.ts), this deletes both the Cosmos doc
// AND its underlying blob in the vault-documents container itself, since
// there's no per-document API route in the loop here to do it
// separately. Vault documents were previously untouched by vehicle/
// account deletion entirely - a real V5C/insurance/licence file left
// permanently orphaned in storage. Best-effort per document: one
// failure never blocks the rest, or the vehicle deletion this is part
// of, from completing.
export async function deleteVaultDocumentsForVehicle(email: string, vehicleId: string): Promise<void> {
  const docs = await getVaultDocumentsForVehicle(email, vehicleId);
  if (!docs.length) return;
  const container = getContainer();
  const vaultContainer = await getVaultContainer();
  await Promise.all(
    docs.map(async (doc) => {
      await vaultContainer.getBlockBlobClient(doc.blobName).deleteIfExists().catch((err) => {
        console.error(`deleteVaultDocumentsForVehicle: failed to delete blob ${doc.blobName}:`, err);
      });
      await container.item(doc.id, email).delete().catch((err) => {
        console.error(`deleteVaultDocumentsForVehicle: failed to delete doc ${doc.id}:`, err);
      });
    })
  );
}
