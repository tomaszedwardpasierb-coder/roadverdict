// Place at: src/app/api/tracker/upload-attachment/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSession } from "@/lib/auth/session";
import { getAttachmentContainer } from "@/lib/blobStorage";
import { matchesDeclaredFileType, type SniffableFileType } from "@/lib/tracker/fileSignature";
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

  const bytes = Buffer.from(await file.arrayBuffer());

  // The declared MIME type above is just a client-supplied claim - a
  // renamed/relabelled file of any kind would otherwise sail through the
  // ALLOWED_TYPES check unchanged. Confirming the actual bytes match
  // closes that gap, same check the Vault's own upload route already
  // applies to its documents.
  if (!matchesDeclaredFileType(bytes, file.type as SniffableFileType)) {
    return NextResponse.json({ error: "This file's contents don't match its type - it may be corrupted or mislabelled." }, { status: 400 });
  }

  // Unguessable, unrelated to the original filename or the user's email -
  // the blob name itself carries no information, same principle as the
  // share-link tokens elsewhere in this app.
  const blobName = `${randomBytes(24).toString("base64url")}.${extension}`;

  try {
    const container = await getAttachmentContainer();
    const blockBlobClient = container.getBlockBlobClient(blobName);
    await blockBlobClient.uploadData(bytes, {
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
    console.error("upload-attachment: upload failed:", err);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
