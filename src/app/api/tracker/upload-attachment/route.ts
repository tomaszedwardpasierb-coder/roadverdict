// Place at: src/app/api/tracker/upload-attachment/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSession } from "@/lib/auth/session";
import { getAttachmentContainer } from "@/lib/blobStorage";
import type { Attachment } from "@/lib/tracker/cosmosHelpers";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    return NextResponse.json({ error: "Only JPG, PNG, or PDF files are allowed." }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File is too large - 10MB maximum." }, { status: 400 });
  }

  // Unguessable, unrelated to the original filename or the user's email -
  // the blob name itself carries no information, same principle as the
  // share-link tokens elsewhere in this app.
  const blobName = `${randomBytes(24).toString("base64url")}.${extension}`;

  try {
    const container = await getAttachmentContainer();
    const blockBlobClient = container.getBlockBlobClient(blobName);
    const arrayBuffer = await file.arrayBuffer();
    await blockBlobClient.uploadData(Buffer.from(arrayBuffer), {
      blobHTTPHeaders: { blobContentType: file.type },
    });

    const attachment: Attachment = {
      blobName,
      fileName: file.name || `receipt.${extension}`,
      fileType: file.type as Attachment["fileType"],
      uploadedAt: new Date().toISOString(),
    };

    return NextResponse.json({ attachment });
  } catch (err) {
    return NextResponse.json(
      { error: "Upload failed. Please try again.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
