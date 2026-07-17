// Place at: src/lib/tracker/bike.ts
import { getContainer } from "@/lib/cosmos";
import type { BikeClass } from "@/lib/priceData";

// id is NOT the plain email - the user doc already uses id=email with the
// same pk=email, and Cosmos requires the (id, pk) pair to be unique. This
// keeps bike docs in the same partition (fast point-reads, no cross-
// partition queries) without colliding with the user doc.
function bikeDocId(email: string): string {
  return `${email}::bike`;
}

export interface BikeDoc {
  id: string;
  pk: string;
  type: "bike";
  make: string;
  model: string;
  engineCC: number;
  bikeClass: BikeClass;
  year: number;
  currentMileage: number;
  startingMileage: number;
  nickname: string;
  dateAdded: string;
}

export async function getBike(email: string): Promise<BikeDoc | null> {
  try {
    const container = getContainer();
    const { resource } = await container.item(bikeDocId(email), email).read<BikeDoc>();
    return resource ?? null;
  } catch {
    // Doc doesn't exist yet (new account, no bike added) - not a real error.
    return null;
  }
}

export async function createBike(
  email: string,
  data: {
    make: string;
    model: string;
    engineCC: number;
    bikeClass: BikeClass;
    year: number;
    currentMileage: number;
    nickname: string;
  }
): Promise<BikeDoc> {
  const container = getContainer();
  const doc: BikeDoc = {
    id: bikeDocId(email),
    pk: email,
    type: "bike",
    make: data.make,
    model: data.model,
    engineCC: data.engineCC,
    bikeClass: data.bikeClass,
    year: data.year,
    currentMileage: data.currentMileage,
    startingMileage: data.currentMileage,
    nickname: data.nickname,
    dateAdded: new Date().toISOString().slice(0, 10),
  };
  await container.items.upsert(doc);
  return doc;
}

export async function updateBikeMileage(email: string, newMileage: number): Promise<BikeDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(bikeDocId(email), email).read<BikeDoc>();
  if (!resource) return null;
  resource.currentMileage = newMileage;
  await container.items.upsert(resource);
  return resource;
}
