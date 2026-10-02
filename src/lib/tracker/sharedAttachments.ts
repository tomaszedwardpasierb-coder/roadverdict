// Place at: src/lib/tracker/sharedAttachments.ts
//
// A receipt file can belong to more than one record: transferring a
// vehicle with its records copies each record into the new owner's
// partition pointing at the SAME blob (see copyTrackerDoc), so the old
// owner's read-only copy and the new owner's live one share files. When
// a vehicle is deleted, only the files no remaining record still points
// at may go - otherwise deleting either copy would strip the receipts
// from the other owner's history.
import { getContainer } from "@/lib/cosmos";
import { deleteAttachmentBlobsBestEffort } from "@/lib/blobStorage";

const CHUNK = 100;

// Call AFTER the deleted vehicle's own records are gone, so any match
// left is a record that genuinely still needs the file.
export async function deleteAttachmentBlobsNoLongerReferenced(blobNames: string[]): Promise<void> {
  const unique = [...new Set(blobNames)];
  if (!unique.length) return;

  const stillUsed = new Set<string>();
  try {
    for (let i = 0; i < unique.length; i += CHUNK) {
      const names = unique.slice(i, i + CHUNK);
      const { resources } = await getContainer()
        .items.query<string>({
          query: "SELECT VALUE a.blobName FROM c JOIN a IN c.attachments WHERE ARRAY_CONTAINS(@names, a.blobName)",
          parameters: [{ name: "@names", value: names }],
        })
        .fetchAll();
      resources.forEach((name) => stillUsed.add(name));
    }
  } catch (err) {
    // Can't tell what's still in use - keeping a file beats deleting
    // someone else's receipt.
    console.error("deleteAttachmentBlobsNoLongerReferenced: reference check failed, keeping every file:", err);
    return;
  }

  await deleteAttachmentBlobsBestEffort(unique.filter((name) => !stillUsed.has(name)));
}
