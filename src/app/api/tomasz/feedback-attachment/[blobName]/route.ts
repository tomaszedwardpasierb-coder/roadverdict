// Place at: src/app/api/tomasz/feedback-attachment/[blobName]/route.ts
//
// Serves a feedback attachment for the admin view only. The tracker's
// own /api/tracker/attachment/[blobName] route can't be reused here: its
// ownsAttachment check is scoped to specific tracker doc types (service
// records, bills, etc.) queried under the submitting user's own email
// partition, neither of which fits a FeedbackDoc (a different doc type
// entirely, living in the fixed "feedback-log" partition). Admin auth is
// getAdminSession() here, not a user session, matching every other
// /api/tomasz/* action route - same trust model the rest of /tomasz
// already has (full account visibility), so no per-doc ownership check
// is needed beyond "is this an admin".
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
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

export async function GET(request: NextRequest, props: { params: Promise<{ blobName: string }> }) {
  const params = await props.params;
  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Not signed in as admin." }, { status: 401 });
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
