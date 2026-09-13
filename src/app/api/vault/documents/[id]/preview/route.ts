// Place at: src/app/api/vault/documents/[id]/preview/route.ts
//
// Streams the ORIGINAL, un-watermarked bytes of one Vault document, for
// the embedded thumbnail/enlarge preview inside the Vault tab only -
// never a real download (inline disposition, no watermark). Still
// behind the exact same checkVaultGate as every other Vault route (Pro
// + 2FA + vault-unlocked + ownership via getVaultDocument's own
// partition scoping), so this isn't a public or guessable URL - it's
// just as protected as the watermarked download route, only the
// content differs.
import { NextRequest, NextResponse } from "next/server";
import { checkVaultGate } from "@/lib/tracker/vaultAccess";
import { extendVaultSession } from "@/lib/tracker/vaultSession";
import { getVaultContainer } from "@/lib/blobStorage";
import { getVaultDocument } from "@/lib/tracker/vaultDocument";

export const dynamic = "force-dynamic";

async function streamToBuffer(readableStream: NodeJS.ReadableStream | undefined): Promise<Buffer> {
  if (!readableStream) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const chunk of readableStream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await checkVaultGate(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await params;
  const doc = await getVaultDocument(gate.email, id);
  if (!doc) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  try {
    const container = await getVaultContainer();
    const downloadResponse = await container.getBlockBlobClient(doc.blobName).download();
    const original = await streamToBuffer(downloadResponse.readableStreamBody);

    await extendVaultSession(gate.email, gate.raw);

    return new NextResponse(new Uint8Array(original), {
      headers: {
        "Content-Type": doc.fileType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(doc.fileName)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Vault document preview failed:", err);
    return NextResponse.json({ error: "Could not prepare this document for preview." }, { status: 500 });
  }
}
