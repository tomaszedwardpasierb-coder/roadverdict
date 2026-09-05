// Place at: src/app/api/report/receipt-request/attachment/[decisionToken]/[blobName]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getReceiptRequestByDecisionToken } from "@/lib/tracker/receiptRequest";
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

// No session check, same reasoning as report-attachment - the owner
// reviewing this from their email has no session on that device. What
// makes this safe is that a blobName is only ever served if it's one of
// the specific items this exact request asked about; the decision token
// doesn't grant access to any other attachment anywhere.
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ decisionToken: string; blobName: string }> }
) {
  const params = await props.params;
  const requestDoc = await getReceiptRequestByDecisionToken(params.decisionToken);
  if (!requestDoc) {
    return NextResponse.json({ error: "This request is no longer available." }, { status: 404 });
  }

  const blobName = decodeURIComponent(params.blobName);
  const item = requestDoc.items.find((i) => i.attachment?.blobName === blobName);
  if (!item || !item.attachment) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

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
