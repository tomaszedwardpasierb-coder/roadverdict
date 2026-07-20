// Place at: src/lib/tracker/cosmosHelpers.ts
import { getContainer } from "@/lib/cosmos";

// Shared shape every tracker doc type has in common. Individual doc
// interfaces (ServiceRecordDoc, FuelLogDoc, and future mod/bill docs)
// extend this rather than repeating id/pk/date/createdAt each time.
export interface TrackerDocBase {
  id: string;
  pk: string;
  type: string;
  date: string;
  createdAt: string;
}

// Creates and upserts a new tracker doc. id is auto-generated as
// `${email}::${idPrefix}::${timestamp}` - same partition as the bike doc,
// distinct id so nothing collides. The Omit<> means TypeScript itself
// checks that each doc type's create function supplies exactly the extra
// fields it needs, nothing more or less.
export async function createTrackerDoc<TDoc extends TrackerDocBase>(
  email: string,
  idPrefix: string,
  type: TDoc["type"],
  data: Omit<TDoc, "id" | "pk" | "type" | "createdAt">
): Promise<TDoc> {
  const container = getContainer();
  const doc = {
    id: `${email}::${idPrefix}::${Date.now()}`,
    pk: email,
    type,
    ...data,
    createdAt: new Date().toISOString(),
  } as TDoc;
  await container.items.upsert(doc);
  return doc;
}

// Queries every doc of a given type within one user's partition, newest
// first. Scoped via the partitionKey option (not just a WHERE clause) so
// it stays a cheap single-partition query, not a cross-partition fan-out.
export async function queryTrackerDocs<TDoc extends TrackerDocBase>(
  email: string,
  type: string
): Promise<TDoc[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<TDoc>(
      {
        query: "SELECT * FROM c WHERE c.type = @type ORDER BY c.date DESC",
        parameters: [{ name: "@type", value: type }],
      },
      { partitionKey: email }
    )
    .fetchAll();
  return resources;
}

// Updates an existing tracker doc in place (read, merge, upsert). email
// is always the authenticated session's email, never client input - that
// is what makes it structurally impossible to edit or delete another
// user's doc, regardless of what id a request claims.
export async function updateTrackerDoc<TDoc extends TrackerDocBase>(
  email: string,
  id: string,
  updates: Partial<Omit<TDoc, "id" | "pk" | "type" | "createdAt">>
): Promise<TDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(id, email).read<TDoc>();
  if (!resource) return null;
  const updated = { ...resource, ...updates } as TDoc;
  await container.items.upsert(updated);
  return updated;
}

export async function deleteTrackerDoc(email: string, id: string): Promise<void> {
  const container = getContainer();
  await container.item(id, email).delete();
}
