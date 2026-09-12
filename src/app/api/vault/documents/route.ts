// Place at: src/app/api/vault/documents/route.ts
//
// List and upload the Vault's per-vehicle documents. Both require the
// full checkVaultGate (session + Pro + 2FA + unlocked vault session),
// then independently confirm the caller's own account actually owns the
// given vehicleId (getBike/getCarById are already partition-scoped by
// email, so a stranger's vehicleId simply resolves to null here) before
// trusting it - not because partition-scoping alone would leak data
// (it wouldn't: a vaultDocument query is always scoped to the caller's
// own partition too), but so a client can't silently attach a document
// to a vehicleId that doesn't correspond to any of the caller's own real
// vehicles.
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkVaultGate } from "@/lib/tracker/vaultAccess";
import { extendVaultSession } from "@/lib/tracker/vaultSession";
import { getBike } from "@/lib/tracker/bike";
import { getCarById } from "@/lib/tracker/car";
import { getVaultContainer } from "@/lib/blobStorage";
import {
  createVaultDocument,
  getVaultDocumentsForVehicle,
  countAndSizeVaultDocuments,
  VAULT_MAX_DOCUMENTS_PER_VEHICLE,
  VAULT_MAX_FILE_SIZE_BYTES,
  VAULT_MAX_TOTAL_BYTES_PER_VEHICLE,
  VAULT_CATEGORIES,
  type VaultDocumentCategory,
} from "@/lib/tracker/vaultDocument";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

const CATEGORY_KEYS = new Set(VAULT_CATEGORIES.map((c) => c.key));

async function resolveVehicleOwnership(email: string, vehicleKind: string | null, vehicleId: string | null): Promise<boolean> {
  if (!vehicleId) return false;
  if (vehicleKind === "bike") return !!(await getBike(email, vehicleId));
  if (vehicleKind === "car") return !!(await getCarById(email, vehicleId));
  return false;
}

export async function GET(request: NextRequest) {
  const gate = await checkVaultGate(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const vehicleKind = request.nextUrl.searchParams.get("vehicleKind");
  const vehicleId = request.nextUrl.searchParams.get("vehicleId");
  if (!(await resolveVehicleOwnership(gate.email, vehicleKind, vehicleId))) {
    return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
  }

  const documents = await getVaultDocumentsForVehicle(gate.email, vehicleId!);
  await extendVaultSession(gate.email, gate.raw);
  return NextResponse.json({ documents });
}

export async function POST(request: NextRequest) {
  const gate = await checkVaultGate(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = formData.get("file");
  const vehicleKind = formData.get("vehicleKind");
  const vehicleId = formData.get("vehicleId");
  const category = formData.get("category");
  const label = formData.get("label");

  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (typeof vehicleKind !== "string" || typeof vehicleId !== "string") {
    return NextResponse.json({ error: "Missing vehicle." }, { status: 400 });
  }
  if (typeof category !== "string" || !CATEGORY_KEYS.has(category as VaultDocumentCategory)) {
    return NextResponse.json({ error: "Choose a document category." }, { status: 400 });
  }

  const extension = ALLOWED_TYPES[file.type];
  if (!extension) return NextResponse.json({ error: "Only JPG, PNG, or PDF files are allowed." }, { status: 400 });
  if (file.size > VAULT_MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File is too large - 10MB maximum." }, { status: 400 });
  }

  if (!(await resolveVehicleOwnership(gate.email, vehicleKind, vehicleId))) {
    return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
  }

  const { count, totalBytes } = await countAndSizeVaultDocuments(gate.email, vehicleId);
  if (count >= VAULT_MAX_DOCUMENTS_PER_VEHICLE) {
    return NextResponse.json({ error: "This vehicle already has 20 documents - delete one before adding another." }, { status: 400 });
  }
  if (totalBytes + file.size > VAULT_MAX_TOTAL_BYTES_PER_VEHICLE) {
    return NextResponse.json({ error: "This vehicle's Vault is at its 100MB limit - delete something before adding another file." }, { status: 400 });
  }

  const blobName = `${randomBytes(24).toString("base64url")}.${extension}`;
  try {
    const container = await getVaultContainer();
    const blockBlobClient = container.getBlockBlobClient(blobName);
    const arrayBuffer = await file.arrayBuffer();
    await blockBlobClient.uploadData(Buffer.from(arrayBuffer), {
      blobHTTPHeaders: { blobContentType: file.type },
    });

    const doc = await createVaultDocument(gate.email, {
      vehicleKind: vehicleKind as "bike" | "car",
      vehicleId,
      blobName,
      fileName: file.name || `document.${extension}`,
      fileType: file.type as "application/pdf" | "image/jpeg" | "image/png",
      fileSize: file.size,
      category: category as VaultDocumentCategory,
      ...(typeof label === "string" && label.trim() ? { label: label.trim() } : {}),
    });

    await extendVaultSession(gate.email, gate.raw);
    return NextResponse.json({ document: doc });
  } catch (err) {
    return NextResponse.json(
      { error: "Upload failed. Please try again.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
