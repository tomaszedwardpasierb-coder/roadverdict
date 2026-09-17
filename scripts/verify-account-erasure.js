#!/usr/bin/env node
// Place at: scripts/verify-account-erasure.js
//
// Read-only. Never deletes anything. Two independent checks:
//
// 1. Cosmos check (cheap, always runs): does ANY document in the `app`
//    container still reference this email, either as its partition key
//    (pk) or as a plain `email` field on a doc partitioned by something
//    else (shareLink/carShareLink by token, vdiPurchase by its own id,
//    assistantQuestion by a fixed shared partition)? This doesn't
//    enumerate every known doc `type` by name the way deleteAccount/
//    deleteBike/deleteCar do internally - it queries by pk and by the
//    email field directly, so it isn't blind to a type nobody thought
//    to list (which is exactly the class of bug this script exists to
//    catch - see the deletion-cascade audit that led to this).
//
// 2. Blob orphan sweep (expensive, opt-in via --sweep): lists every blob
//    in the `attachments` and `vault-documents` containers and checks
//    which ones no longer have any Cosmos document pointing at them.
//    This is NOT specific to one email and can't be made to be - once a
//    document is deleted, its blobName was the only link between that
//    blob and the account that owned it; blobs themselves carry no
//    owner metadata. So this only answers "how much orphaned blob data
//    exists across the whole account base right now", not "did this
//    specific person's files get deleted" - if you're checking an
//    account that was already deleted before the erasure fixes landed,
//    there is no way to attribute any orphan found here back to them
//    specifically. Run this after a *fresh* test-account deletion
//    instead, if you want to prove the fix actually works end to end:
//    note the blob count before deleting, delete, then confirm the
//    count dropped by the right amount.
//
// Usage:
//   COSMOS_CONNECTION_STRING=... AZURE_STORAGE_CONNECTION_STRING=... \
//     node scripts/verify-account-erasure.js someone@example.com
//   ...same env vars... node scripts/verify-account-erasure.js --sweep
//
// Never commit real customer email addresses or the output of this
// script anywhere - treat both as the personal data they are.

const { CosmosClient } = require("@azure/cosmos");
const { BlobServiceClient } = require("@azure/storage-blob");

const ATTACHMENT_CONTAINER = "attachments";
const VAULT_CONTAINER = "vault-documents";

async function checkEmail(email) {
  const cosmosConn = process.env.COSMOS_CONNECTION_STRING;
  if (!cosmosConn) {
    console.error("Missing COSMOS_CONNECTION_STRING - set it to the real production value before running this.");
    process.exit(1);
  }
  const client = new CosmosClient(cosmosConn);
  const container = client.database("roadverdict").container("app");

  console.log(`Checking Cosmos for any remaining document referencing ${email}...\n`);

  const { resources: ownPartition } = await container.items
    .query({
      query: "SELECT c.id, c.type FROM c WHERE c.pk = @email",
      parameters: [{ name: "@email", value: email }],
    })
    .fetchAll();

  const { resources: crossPartition } = await container.items
    .query({
      query: "SELECT c.id, c.type, c.pk FROM c WHERE c.email = @email AND c.pk != @email",
      parameters: [{ name: "@email", value: email }],
    })
    .fetchAll();

  if (ownPartition.length === 0 && crossPartition.length === 0) {
    console.log("Clean - no Cosmos document anywhere references this email.");
    return;
  }

  if (ownPartition.length > 0) {
    console.log(`Found ${ownPartition.length} document(s) still in this email's own partition:`);
    const byType = {};
    for (const doc of ownPartition) byType[doc.type] = (byType[doc.type] ?? 0) + 1;
    for (const [type, count] of Object.entries(byType)) console.log(`  - ${type}: ${count}`);
  }

  if (crossPartition.length > 0) {
    console.log(`\nFound ${crossPartition.length} document(s) elsewhere that still name this email:`);
    for (const doc of crossPartition) console.log(`  - ${doc.type} (id: ${doc.id}, pk: ${doc.pk})`);
  }

  console.log("\nNot clean - see the list above.");
}

async function sweepOrphanBlobs() {
  const cosmosConn = process.env.COSMOS_CONNECTION_STRING;
  const storageConn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!cosmosConn || !storageConn) {
    console.error("Missing COSMOS_CONNECTION_STRING and/or AZURE_STORAGE_CONNECTION_STRING.");
    process.exit(1);
  }
  const client = new CosmosClient(cosmosConn);
  const container = client.database("roadverdict").container("app");
  const blobService = BlobServiceClient.fromConnectionString(storageConn);

  console.log("Collecting every blobName still referenced by a real Cosmos document...");
  const [{ resources: attachmentDocs }, { resources: vaultDocs }, { resources: avatarDocs }] = await Promise.all([
    container.items
      .query({
        query:
          "SELECT VALUE a.blobName FROM c JOIN a IN c.attachments WHERE c.type IN ('serviceRecord','fuelLog','mod','bill','carServiceRecord','carFuelLog','carMod','carBill')",
      })
      .fetchAll(),
    container.items.query({ query: "SELECT VALUE c.blobName FROM c WHERE c.type = 'vaultDocument'" }).fetchAll(),
    container.items.query({ query: "SELECT VALUE c.avatarBlobName FROM c WHERE c.type = 'user' AND IS_DEFINED(c.avatarBlobName)" }).fetchAll(),
  ]);
  const referencedAttachmentBlobs = new Set([...attachmentDocs, ...avatarDocs]);
  const referencedVaultBlobs = new Set(vaultDocs);

  console.log(`  ${referencedAttachmentBlobs.size} blob(s) referenced in the attachments container.`);
  console.log(`  ${referencedVaultBlobs.size} blob(s) referenced in the vault-documents container.\n`);

  for (const [containerName, referenced] of [
    [ATTACHMENT_CONTAINER, referencedAttachmentBlobs],
    [VAULT_CONTAINER, referencedVaultBlobs],
  ]) {
    console.log(`Scanning the "${containerName}" blob container...`);
    const blobContainer = blobService.getContainerClient(containerName);
    let total = 0;
    let orphaned = 0;
    for await (const blob of blobContainer.listBlobsFlat()) {
      total++;
      if (!referenced.has(blob.name)) orphaned++;
    }
    console.log(`  ${total} blob(s) total, ${orphaned} with no Cosmos document pointing at them.\n`);
  }

  console.log(
    "Note: an orphan here can't be attributed to any specific account - blobs carry no owner metadata, " +
      "only the (now possibly deleted) Cosmos document that pointed at it did."
  );
}

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node scripts/verify-account-erasure.js someone@example.com");
  console.error("   or: node scripts/verify-account-erasure.js --sweep");
  process.exit(1);
}

(arg === "--sweep" ? sweepOrphanBlobs() : checkEmail(arg.trim().toLowerCase())).catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
