// Place at: src/app/api/account/avatar/route.ts
//
// Deliberately simpler than the generic receipt/invoice attachment
// system (upload-attachment/route.ts + attachment/[blobName]/route.ts):
// an avatar is never shared with anyone else and there's exactly one
// per account, so there's no ownership check to write at all - GET only
// ever looks up and streams back the signed-in caller's OWN
// avatarBlobName, never one taken from the request.
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import sharp from "sharp";
import { getSession } from "@/lib/auth/session";
import { getUserDoc } from "@/lib/tracker/userDoc";
import { updateProfile } from "@/lib/tracker/userAccount";
import { getAttachmentContainer } from "@/lib/blobStorage";

export const dynamic = "force-dynamic";

const MAX_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024; // 2MB - the stored image ends up far smaller than this once resized
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const AVATAR_SIZE_PX = 256;

async function deleteBlobBestEffort(blobName: string) {
  try {
    const container = await getAttachmentContainer();
    await container.getBlockBlobClient(blobName).deleteIfExists();
  } catch (err) {
    console.error(`avatar: failed to delete old blob ${blobName} (leaving it orphaned, not fatal):`, err);
  }
}

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
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Only JPG, PNG, or WebP images are allowed." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return NextResponse.json({ error: "Image is too large - 2MB maximum." }, { status: 400 });
  }

  try {
    // Whatever's uploaded, however large, only a small square JPEG
    // thumbnail is ever actually stored - "cover" crops to fill the
    // square rather than letterboxing, the right choice for a face/logo
    // thumbnail (unlike receiptParse.ts's "inside" fit, which needs the
    // whole receipt visible, not a crop).
    const originalBuffer = Buffer.from(await file.arrayBuffer());
    const resized = await sharp(originalBuffer)
      .rotate()
      .resize({ width: AVATAR_SIZE_PX, height: AVATAR_SIZE_PX, fit: "cover" })
      .jpeg({ quality: 80 })
      .toBuffer();

    const blobName = `avatar-${randomBytes(16).toString("base64url")}.jpg`;
    const container = await getAttachmentContainer();
    await container.getBlockBlobClient(blobName).uploadData(resized, {
      blobHTTPHeaders: { blobContentType: "image/jpeg" },
    });

    const previousAvatarBlobName = (await getUserDoc(session.email))?.avatarBlobName;
    await updateProfile(session.email, { avatarBlobName: blobName });
    if (previousAvatarBlobName) await deleteBlobBestEffort(previousAvatarBlobName);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Upload failed. Please try again.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const user = await getUserDoc(session.email);
  if (!user?.avatarBlobName) {
    return NextResponse.json({ error: "No avatar set." }, { status: 404 });
  }

  try {
    const container = await getAttachmentContainer();
    const downloadResponse = await container.getBlockBlobClient(user.avatarBlobName).download();
    const chunks: Buffer[] = [];
    for await (const chunk of downloadResponse.readableStreamBody ?? []) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return new NextResponse(new Uint8Array(Buffer.concat(chunks)), {
      headers: {
        "Content-Type": downloadResponse.contentType ?? "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Avatar not found." }, { status: 404 });
  }
}

export async function DELETE() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const user = await getUserDoc(session.email);
  if (user?.avatarBlobName) await deleteBlobBestEffort(user.avatarBlobName);
  await updateProfile(session.email, { avatarBlobName: null });

  return NextResponse.json({ ok: true });
}
