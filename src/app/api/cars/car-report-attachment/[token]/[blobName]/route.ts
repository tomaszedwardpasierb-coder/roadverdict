// Place at: src/app/api/cars/car-report-attachment/[token]/[blobName]/route.ts
// Car mirror of api/tracker/report-attachment/[token]/[blobName] - same
// approved-blobName gate, same reasoning for skipping a session check.
import { NextRequest, NextResponse } from "next/server";
import { resolveCarShareToken } from "@/lib/tracker/carShareLink";
import { getCarServiceRecords } from "@/lib/tracker/carServiceRecord";
import { getCarMods } from "@/lib/tracker/carMod";
import { getCarBills } from "@/lib/tracker/carBill";
import { getAttachmentContainer } from "@/lib/blobStorage";
import { getCarReceiptRequestsForShareToken } from "@/lib/tracker/carReceiptRequest";

export const dynamic = "force-dynamic";

async function streamToBuffer(readableStream: NodeJS.ReadableStream | undefined): Promise<Buffer> {
  if (!readableStream) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const chunk of readableStream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ token: string; blobName: string }> }
) {
  const params = await props.params;
  const resolved = await resolveCarShareToken(params.token);
  if (!resolved) {
    return NextResponse.json({ error: "Invalid or expired link." }, { status: 404 });
  }
  const { email, carId } = resolved;
  const blobName = decodeURIComponent(params.blobName);

  const [records, mods, bills, requests] = await Promise.all([
    getCarServiceRecords(email, carId),
    getCarMods(email, carId),
    getCarBills(email, carId),
    getCarReceiptRequestsForShareToken(email, params.token),
  ]);

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
