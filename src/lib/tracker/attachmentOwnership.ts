// Place at: src/lib/tracker/attachmentOwnership.ts
//
// Blob storage isn't partitioned by owner the way every Cosmos doc is
// (see cosmosHelpers.ts) - a blobName is just an unguessable random
// token (see upload-attachment/route.ts), so any route serving or
// inspecting a blob by name has to prove ownership itself, by checking
// the blobName actually appears on one of the caller's own records.
// This mirrors the check report-attachment/[token]/[blobName]/route.ts
// already does for anonymous buyer links (scoped to one bike there),
// just scoped to the whole account here.
//
// One partition-scoped COUNT query, with the blobName match done
// server-side by Cosmos (ARRAY_CONTAINS' partial-match mode) - not one
// fetch per record type per bike, pulling full documents down just to
// filter them in JS. This runs once per attachment thumbnail rendered
// anywhere in the app, so its cost has to stay flat regardless of how
// many bikes or records an account has, not multiply with them - see
// demoSeedRunner.ts's own comment on the 1000 RU/s ceiling this app
// runs under for why that multiplication is a real, not theoretical,
// risk.
import { getContainer } from "@/lib/cosmos";

const ATTACHMENT_BEARING_TYPES = ["serviceRecord", "fuelLog", "mod", "bill"];

export async function ownsAttachment(email: string, blobName: string): Promise<boolean> {
  const container = getContainer();
  const { resources } = await container.items
    .query<number>(
      {
        query:
          "SELECT VALUE COUNT(1) FROM c WHERE ARRAY_CONTAINS(@types, c.type) AND ARRAY_CONTAINS(c.attachments, {\"blobName\": @blobName}, true)",
        parameters: [
          { name: "@types", value: ATTACHMENT_BEARING_TYPES },
          { name: "@blobName", value: blobName },
        ],
      },
      { partitionKey: email }
    )
    .fetchAll();
  return (resources[0] ?? 0) > 0;
}
