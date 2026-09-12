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
// Deliberately does NOT import stripCosmosMetadata from cosmosHelpers.ts,
// even though it does exactly what's needed below - that file also
// imports next/headers (for its impersonation-logging cookie read),
// which is only valid in a server context. VAULT_CATEGORIES/
// VaultDocumentCategory from this same file are imported directly by
// VaultTab.tsx, a 'use client' component, so anything this module
// imports has to be safe in a client bundle too - a local copy of the
// same one-line stripping logic avoids dragging next/headers along.
import crypto from "crypto";
import { getContainer } from "@/lib/cosmos";

const COSMOS_SYSTEM_KEYS = ["_rid", "_self", "_etag", "_attachments", "_ts"] as const;

function stripCosmosMetadata<T extends object>(doc: T): T {
  const clean = { ...doc } as Record<string, unknown>;
  for (const key of COSMOS_SYSTEM_KEYS) delete clean[key];
  return clean as T;
}

export type VaultDocumentCategory =
  | "dvlaLegal"
  | "insurance"
  | "purchaseFinance"
  | "licences"
  | "modifications"
  | "warranties"
  | "overseas";

export const VAULT_CATEGORIES: { key: VaultDocumentCategory; label: string; examples: string[] }[] = [
  {
    key: "dvlaLegal",
    label: "DVLA / Legal",
    examples: [
      "V5C logbook",
      "MOT certificate",
      "SORN confirmation",
      "Change of keeper confirmation",
      "Personalised plate assignment / retention certificate",
      "Age-related registration letter (classic vehicles)",
    ],
  },
  {
    key: "insurance",
    label: "Insurance",
    examples: ["Certificate of insurance", "Policy schedule", "Breakdown cover confirmation", "Track day insurance documents"],
  },
  {
    key: "purchaseFinance",
    label: "Purchase & Finance",
    examples: ["Original bill of sale / receipt", "Finance agreement / settlement letter", "Part-exchange paperwork", "HPI / VDI check report"],
  },
  {
    key: "licences",
    label: "Licences & Entitlements",
    examples: ["Driving licence (both sides)", "CBT certificate", "DAS / full motorcycle test pass certificate", "Advanced rider qualification (IAM, RoSPA)"],
  },
  {
    key: "modifications",
    label: "Modifications & Homologation",
    examples: ["IVA certificate", "Engineer's letter for non-standard modifications", "SVA certificate (older vehicles)", "Recall completion certificate"],
  },
  {
    key: "warranties",
    label: "Warranties",
    examples: ["Manufacturer warranty document", "Extended warranty"],
  },
  {
    key: "overseas",
    label: "Overseas / Touring",
    examples: ["Carnet de passages", "Green card (international insurance)", "Foreign registration documents (imported vehicles)"],
  },
];

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
