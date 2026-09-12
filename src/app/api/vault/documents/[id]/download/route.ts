// Place at: src/app/api/vault/documents/[id]/download/route.ts
//
// Streams a watermarked copy of one Vault document - the watermarked
// bytes are generated fresh on every request and never written back to
// blob storage, only ever the original. No SAS URL, same "always proxy
// through our own authenticated route" posture as
// api/tracker/attachment/[blobName]/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { checkVaultGate } from "@/lib/tracker/vaultAccess";
import { extendVaultSession } from "@/lib/tracker/vaultSession";
import { getVaultContainer } from "@/lib/blobStorage";
import { getVaultDocument } from "@/lib/tracker/vaultDocument";
import { watermarkPdf, watermarkImage } from "@/lib/tracker/vaultWatermark";

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

    const stamp = `${gate.email} — Downloaded ${new Date().toLocaleString("en-GB")}`;
    const watermarked =
      doc.fileType === "application/pdf" ? await watermarkPdf(original, stamp) : await watermarkImage(original, stamp, doc.fileType);

    await extendVaultSession(gate.email, gate.raw);

    return new NextResponse(new Uint8Array(watermarked), {
      headers: {
        "Content-Type": doc.fileType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.fileName)}"`,
        // Never cached - each response is watermarked with the current
        // moment, so a cached copy would show a stale timestamp.
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Could not prepare this document for download.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
