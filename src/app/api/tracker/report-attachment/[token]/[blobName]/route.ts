// Place at: src/app/api/tracker/report-attachment/[token]/[blobName]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { resolveShareToken } from "@/lib/tracker/shareLink";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getMods } from "@/lib/tracker/mod";
import { getBills } from "@/lib/tracker/bill";
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

// Deliberately no session check - the whole point of a share link is that
// a prospective buyer, who has no RoadVerdict account, can view it. What
// makes this safe instead is the ownership check below: a blobName is
// only ever served if it genuinely belongs to a record on THIS bike's own
// report. A share token alone doesn't grant access to arbitrary blobs.
export async function GET(request: NextRequest, { params }: { params: { token: string; blobName: string } }) {
  const resolved = await resolveShareToken(params.token);
  if (!resolved) {
    return NextResponse.json({ error: "Invalid or expired link." }, { status: 404 });
  }
  const { email, bikeId } = resolved;
  const blobName = decodeURIComponent(params.blobName);

  const [records, mods, bills] = await Promise.all([
    getServiceRecords(email, bikeId),
    getMods(email, bikeId),
    getBills(email, bikeId),
  ]);

  const allAttachmentBlobNames = new Set(
    [...records, ...mods, ...bills].flatMap((r) => r.attachments?.map((a) => a.blobName) ?? [])
  );

  if (!allAttachmentBlobNames.has(blobName)) {
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
