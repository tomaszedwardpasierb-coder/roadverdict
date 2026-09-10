// Place at: src/lib/tracker/carTransferRequest.ts
//
// Car equivalent of bikeTransferRequest.ts - same shape and reasoning,
// just against a car. See that file's own comments for the full
// rationale behind the hashed-token/TTL/initiatedBy design.
import { getContainer } from "@/lib/cosmos";
import { hashToken, generateToken } from "@/lib/auth/crypto";

export interface CarTransferRequestDoc {
  id: string;
  pk: string;
  type: "carTransferRequest";
  carId: string;
  ownerEmail: string;
  recipientEmail: string;
  initiatedBy: "owner" | "recipient";
  status: "pending" | "accepted" | "declined";
  tokenHash: string;
  createdAt: string;
  decidedAt?: string;
  includeRecords?: boolean;
  carSummary: { make: string; model: string; year?: number; isCustomBuild: boolean };
  ttl: number;
}

const REQUEST_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function createCarTransferRequest(params: {
  ownerEmail: string;
  carId: string;
  recipientEmail: string;
  carSummary: CarTransferRequestDoc["carSummary"];
  initiatedBy?: "owner" | "recipient";
  includeRecords?: boolean;
}): Promise<{ doc: CarTransferRequestDoc; token: string }> {
  const container = getContainer();
  const { raw: token, hash: tokenHash } = generateToken();

  const doc: CarTransferRequestDoc = {
    id: `${params.ownerEmail}::carTransferRequest::${Date.now()}`,
    pk: params.ownerEmail,
    type: "carTransferRequest",
    carId: params.carId,
    ownerEmail: params.ownerEmail,
    recipientEmail: params.recipientEmail,
    initiatedBy: params.initiatedBy ?? "owner",
    status: "pending",
    tokenHash,
    createdAt: new Date().toISOString(),
    carSummary: params.carSummary,
    includeRecords: params.includeRecords,
    ttl: REQUEST_TTL_SECONDS,
  };

  await container.items.upsert(doc);
  return { doc, token };
}

export async function getPendingCarTransferRequestsForOwner(ownerEmail: string): Promise<CarTransferRequestDoc[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<CarTransferRequestDoc>({
      query: "SELECT * FROM c WHERE c.pk = @email AND c.type = 'carTransferRequest' AND c.status = 'pending'",
      parameters: [{ name: "@email", value: ownerEmail }],
    })
    .fetchAll();
  return resources;
}

export async function hasActiveCarTransferRequestForCar(ownerEmail: string, carId: string): Promise<boolean> {
  const container = getContainer();
  const { resources } = await container.items
    .query<{ id: string }>({
      query:
        "SELECT c.id FROM c WHERE c.pk = @email AND c.type = 'carTransferRequest' AND c.carId = @carId AND (c.status = 'pending' OR c.status = 'accepted')",
      parameters: [
        { name: "@email", value: ownerEmail },
        { name: "@carId", value: carId },
      ],
    })
    .fetchAll();
  return resources.length > 0;
}

export async function getCarTransferRequestByToken(rawToken: string): Promise<CarTransferRequestDoc | null> {
  const container = getContainer();
  const hash = hashToken(rawToken);
  const { resources } = await container.items
    .query<CarTransferRequestDoc>({
      query: "SELECT * FROM c WHERE c.type = 'carTransferRequest' AND c.tokenHash = @hash",
      parameters: [{ name: "@hash", value: hash }],
    })
    .fetchAll();
  return resources[0] ?? null;
}

export async function getCarTransferRequestById(
  requestId: string,
  ownerEmail: string
): Promise<CarTransferRequestDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(requestId, ownerEmail).read<CarTransferRequestDoc>();
  return resource ?? null;
}

export async function decideCarTransferRequest(
  requestId: string,
  ownerEmail: string,
  decision: "accepted" | "declined"
): Promise<CarTransferRequestDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(requestId, ownerEmail).read<CarTransferRequestDoc>();
  if (!resource) return null;
  resource.status = decision;
  resource.decidedAt = new Date().toISOString();
  await container.items.upsert(resource);
  return resource;
}
