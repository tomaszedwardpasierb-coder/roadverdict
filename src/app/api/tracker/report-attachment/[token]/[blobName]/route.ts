// Place at: src/app/api/tracker/report-attachment/[token]/[blobName]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { resolveShareToken } from "@/lib/tracker/shareLink";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getMods } from "@/lib/tracker/mod";
import { getBills } from "@/lib/tracker/bill";
import { getAttachmentContainer } from "@/lib/blobStorage";
import { getReceiptRequestsForShareToken } from "@/lib/tracker/receiptRequest";

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
// makes this safe instead is two checks: a blobName must genuinely belong
// to a record on THIS bike's own report, AND that record's own receipt
// request must actually be approved - ReportHistoryTable.tsx only ever
// renders a link once status is 'approved' (never for no request yet,
// pending, or declined), and this route has to enforce the same gate
// server-side. Otherwise the real blobName sitting in the report page's
// own props for every row - approved or not - would let anyone who reads
// the page's HTML fetch a receipt the owner never agreed to share.
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ token: string; blobName: string }> }
) {
  const params = await props.params;
  const resolved = await resolveShareToken(params.token);
  if (!resolved) {
    return NextResponse.json({ error: "Invalid or expired link." }, { status: 404 });
  }
  const { email, bikeId } = resolved;
  const blobName = decodeURIComponent(params.blobName);

  const [records, mods, bills, requests] = await Promise.all([
    getServiceRecords(email, bikeId),
    getMods(email, bikeId),
    getBills(email, bikeId),
    getReceiptRequestsForShareToken(email, params.token),
  ]);

  // Most recent request wins per entry - same tie-break sellerReportData.ts
  // uses for the same data, so a newer decision (e.g. approved after an
  // earlier decline) is the one that governs here too.
  const latestStatusByEntryId = new Map<string, string>();
  for (const r of [...requests].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())) {
    for (const item of r.items) {
      latestStatusByEntryId.set(item.entryId, item.status);
    }
  }

  const approvedBlobNames = new Set(
    [...records, ...mods, ...bills]
      .filter((r) => latestStatusByEntryId.get(r.id) === "approved")
      .flatMap((r) => r.attachments?.map((a) => a.blobName) ?? [])
  );

  if (!approvedBlobNames.has(blobName)) {
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
