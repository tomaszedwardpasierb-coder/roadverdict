// Place at: src/app/api/vault/documents/[id]/route.ts
//
// Deletes one Vault document (metadata + blob). No separate vehicle-
// ownership check needed - getVaultDocument/deleteVaultDocument are
// point reads/deletes scoped to the caller's own Cosmos partition
// (pk = email), so a stranger's document id simply doesn't exist within
// this session's partition at all, same as every other tracker-doc
// delete in this app (deleteTrackerDoc has no separate ownership check
// either, for the identical reason).
import { NextRequest, NextResponse } from "next/server";
import { checkVaultGate } from "@/lib/tracker/vaultAccess";
import { extendVaultSession } from "@/lib/tracker/vaultSession";
import { getVaultContainer } from "@/lib/blobStorage";
import { getVaultDocument, deleteVaultDocument } from "@/lib/tracker/vaultDocument";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await checkVaultGate(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await params;
  const doc = await getVaultDocument(gate.email, id);
  if (!doc) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const container = await getVaultContainer();
  await container.getBlockBlobClient(doc.blobName).deleteIfExists();
  await deleteVaultDocument(gate.email, id);

  await extendVaultSession(gate.email, gate.raw);
  return NextResponse.json({ ok: true });
}
