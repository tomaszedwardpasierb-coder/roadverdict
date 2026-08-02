// Place at: src/app/api/tracker/attachment/[blobName]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getAttachmentContainer } from "@/lib/blobStorage";

export const dynamic = "force-dynamic";

async function streamToBuffer(readableStream: NodeJS.ReadableStream | undefined): Promise<Buffer> {
  if (!readableStream) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const chunk of readableStream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// Every attachment is only ever fetched by an authenticated user - there is
// no public/anonymous access to blob storage at all (see blobStorage.ts).
// The blob name itself is an unguessable random token, same trust model as
// the share-link tokens elsewhere in this app, but gated behind a real
// session check too - stricter than that precedent, not looser.
export async function GET(request: NextRequest, { params }: { params: { blobName: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const blobName = decodeURIComponent(params.blobName);

  try {
    const container = await getAttachmentContainer();
    const blockBlobClient = container.getBlockBlobClient(blobName);
    const downloadResponse = await blockBlobClient.download();
    const buffer = await streamToBuffer(downloadResponse.readableStreamBody);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": downloadResponse.contentType ?? "application/octet-stream",
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }
}
