// Place at: src/lib/tracker/mod.ts
import { createTrackerDoc, queryTrackerDocs, updateTrackerDoc, deleteTrackerDoc, type TrackerDocBase, type Attachment } from "./cosmosHelpers";

export interface ModDoc extends TrackerDocBase {
  type: "mod";
  category: string;
  name: string;
  cost: number;
  mileage: number;
  notes: string;
}

export async function createMod(
  email: string,
  data: { bikeId: string; category: string; name: string; cost: number; mileage: number; date: string; notes: string; attachments?: Attachment[] }
): Promise<ModDoc> {
  return createTrackerDoc<ModDoc>(email, "mod", "mod", data);
}

export async function getMods(email: string, bikeId: string): Promise<ModDoc[]> {
  return queryTrackerDocs<ModDoc>(email, "mod", bikeId);
}

export async function updateMod(
  email: string,
  id: string,
  data: { category: string; name: string; cost: number; mileage: number; date: string; notes: string; attachments?: Attachment[] }
): Promise<ModDoc | null> {
  return updateTrackerDoc<ModDoc>(email, id, data);
}

export async function deleteMod(email: string, id: string): Promise<void> {
  return deleteTrackerDoc(email, id);
}
