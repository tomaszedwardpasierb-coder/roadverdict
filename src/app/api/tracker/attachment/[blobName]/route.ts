// Place at: src/app/api/tracker/attachment/[blobName]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getAttachmentContainer } from "@/lib/blobStorage";
import { ownsAttachment } from "@/lib/tracker/attachmentOwnership";

export const dynamic = "force-dynamic";

async function streamToBuffer(readableStream: NodeJS.ReadableStream | undefined): Promise<Buffer> {
  if (!readableStream) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const chunk of readableStream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// A blobName alone doesn't prove the requester owns the file it points to
// - this app's own sharing features (report links, receipt-request
// emails) deliberately hand blobNames to low-trust third parties who have
// no RoadVerdict account, so "any signed-in session" is a weaker gate
// than it looks: anyone who's ever seen a blobName can sign up free and
// pass this check. ownsAttachment closes that gap the same way the
// anonymous report-attachment route already does for its own case.
export async function GET(request: NextRequest, { params }: { params: { blobName: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const blobName = decodeURIComponent(params.blobName);

  if (!(await ownsAttachment(session.email, blobName))) {
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
