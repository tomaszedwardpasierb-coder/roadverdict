// Place at: src/app/api/account/feedback/upload-attachment/route.ts
//
// A deliberate near-duplicate of /api/tracker/upload-attachment, not a
// parameterized reuse of it - the requirement this exists for is that a
// bug-report attachment (up to 3, PNG/JPG only) must be a genuinely
// separate mechanism from the tracker's own receipt-attachment flow
// (JPG/PNG/PDF, single file), which must stay completely untouched. Same
// shared "attachments" blob container either way - its own comment
// already covers receipts/invoices and account avatars, so a third
// on-pattern use here isn't a new isolation decision the way the
// Vault's own separate container was.
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSession } from "@/lib/auth/session";
import { getAttachmentContainer, BLOB_UPLOAD_TIMEOUT_MS } from "@/lib/blobStorage";
import { matchesDeclaredFileType, type SniffableFileType } from "@/lib/tracker/fileSignature";
import type { Attachment } from "@/lib/tracker/cosmosHelpers";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
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
    return NextResponse.json({ error: "Only JPG or PNG files are allowed." }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File is too large - 10MB maximum." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // The declared MIME type above is just a client-supplied claim - see
  // /api/tracker/upload-attachment's own comment on why the real bytes
  // are checked too.
  if (!matchesDeclaredFileType(bytes, file.type as SniffableFileType)) {
    return NextResponse.json({ error: "This file's contents don't match its type - it may be corrupted or mislabelled." }, { status: 400 });
  }

  const blobName = `${randomBytes(24).toString("base64url")}.${extension}`;

  try {
    const container = await getAttachmentContainer();
    const blockBlobClient = container.getBlockBlobClient(blobName);
    await blockBlobClient.uploadData(bytes, {
      blobHTTPHeaders: { blobContentType: file.type },
      abortSignal: AbortSignal.timeout(BLOB_UPLOAD_TIMEOUT_MS),
    });

    const attachment: Attachment = {
      blobName,
      fileName: file.name || `screenshot.${extension}`,
      fileType: file.type as Attachment["fileType"],
      uploadedAt: new Date().toISOString(),
    };

    return NextResponse.json({ attachment });
  } catch (err) {
    console.error("feedback/upload-attachment: upload failed:", err);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
