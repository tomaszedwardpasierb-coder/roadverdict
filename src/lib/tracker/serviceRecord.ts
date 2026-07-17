// Place at: src/lib/tracker/serviceRecord.ts
import { getContainer } from "@/lib/cosmos";

export interface ServiceRecordDoc {
  id: string;
  pk: string;
  type: "serviceRecord";
  jobType: string;
  cost: number;
  mileage: number;
  date: string;
  notes: string;
  createdAt: string;
}

export async function createServiceRecord(
  email: string,
  data: { jobType: string; cost: number; mileage: number; date: string; notes: string }
): Promise<ServiceRecordDoc> {
  const container = getContainer();
  const doc: ServiceRecordDoc = {
    id: `${email}::service::${Date.now()}`,
    pk: email,
    type: "serviceRecord",
    jobType: data.jobType,
    cost: data.cost,
    mileage: data.mileage,
    date: data.date,
    notes: data.notes,
    createdAt: new Date().toISOString(),
  };
  await container.items.upsert(doc);
  return doc;
}

export async function getServiceRecords(email: string): Promise<ServiceRecordDoc[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<ServiceRecordDoc>(
      { query: "SELECT * FROM c WHERE c.type = 'serviceRecord' ORDER BY c.date DESC" },
      { partitionKey: email }
    )
    .fetchAll();
  return resources;
}
