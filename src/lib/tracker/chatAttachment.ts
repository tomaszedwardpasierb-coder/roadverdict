// Place at: src/lib/tracker/chatAttachment.ts
//
// The photo or PDF attached to an assistant message, as the AI itself
// sees it. A file uploaded for the chat isn't on any record yet, so
// ownsAttachment can't vouch for it - instead upload-attachment stamps
// every new blob with a hash of its uploader's email (never the email
// itself), and only a file stamped with this account's hash, or already
// on one of its records, is ever read. Anything else is simply not shown
// to the AI.
import { getAttachmentContainer } from "@/lib/blobStorage";
import { hashToken } from "@/lib/auth/crypto";
import { ownsAttachment } from "@/lib/tracker/attachmentOwnership";

export const ATTACHMENT_OWNER_METADATA = "ownerhash";
const MAX_BYTES = 10 * 1024 * 1024;
const AI_READABLE = new Set(["image/jpeg", "image/png", "application/pdf"]);

export function attachmentOwnerHash(email: string): string {
  return hashToken(email.trim().toLowerCase());
}

async function streamToBuffer(stream: NodeJS.ReadableStream | undefined): Promise<Buffer> {
  if (!stream) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

export async function loadAttachmentForAi(email: string, blobName: string): Promise<{ mimeType: string; base64: string } | null> {
  try {
    const blob = (await getAttachmentContainer()).getBlockBlobClient(blobName);
    const properties = await blob.getProperties();
    const stamped = properties.metadata?.[ATTACHMENT_OWNER_METADATA] === attachmentOwnerHash(email);
    if (!stamped && !(await ownsAttachment(email, blobName))) return null;
    const mimeType = properties.contentType ?? "";
    if (!AI_READABLE.has(mimeType) || (properties.contentLength ?? 0) > MAX_BYTES) return null;
    const buffer = await streamToBuffer((await blob.download()).readableStreamBody);
    return { mimeType, base64: buffer.toString("base64") };
  } catch (err) {
    console.error("Assistant: couldn't read the attachment:", err);
    return null;
  }
}
