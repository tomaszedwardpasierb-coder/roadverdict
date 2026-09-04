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
import { getBikesForUser } from "@/lib/tracker/bike";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getFuelLogs } from "@/lib/tracker/fuelLog";
import { getMods } from "@/lib/tracker/mod";
import { getBills } from "@/lib/tracker/bill";

export async function ownsAttachment(email: string, blobName: string): Promise<boolean> {
  const bikes = await getBikesForUser(email);
  for (const bike of bikes) {
    const [records, fuelLogs, mods, bills] = await Promise.all([
      getServiceRecords(email, bike.id),
      getFuelLogs(email, bike.id),
      getMods(email, bike.id),
      getBills(email, bike.id),
    ]);
    const hasIt = [...records, ...fuelLogs, ...mods, ...bills].some((r) =>
      r.attachments?.some((a) => a.blobName === blobName)
    );
    if (hasIt) return true;
  }
  return false;
}
