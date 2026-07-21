// Place at: src/lib/admin/stats.ts
import { getContainer } from "@/lib/cosmos";

export interface DbTypeCount {
  type: string;
  count: number;
}

export async function getDbStats(): Promise<DbTypeCount[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<DbTypeCount>({ query: "SELECT c.type, COUNT(1) as count FROM c GROUP BY c.type" })
    .fetchAll();
  return resources.sort((a, b) => b.count - a.count);
}

export async function getActiveSessionCount(): Promise<number> {
  const container = getContainer();
  const { resources } = await container.items
    .query<number>({
      query: "SELECT VALUE COUNT(1) FROM c WHERE c.type = 'session' AND c.expiresAt > @now",
      parameters: [{ name: "@now", value: new Date().toISOString() }],
    })
    .fetchAll();
  return resources[0] ?? 0;
}

export interface FuelPriceStatus {
  pricePenceLitre: number;
  weekCommencing: string;
}

export async function getFuelPriceStatus(): Promise<FuelPriceStatus | null> {
  const container = getContainer();
  try {
    interface FuelPriceDoc { pricePenceLitre: number; weekCommencing: string }
    const { resource } = await container.item("fuelPrice", "system").read<FuelPriceDoc>();
    if (!resource) return null;
    return { pricePenceLitre: resource.pricePenceLitre, weekCommencing: resource.weekCommencing };
  } catch {
    return null;
  }
}

export interface ReminderCronStatus {
  lastRunAt: string;
  checked: number;
  sent: number;
}

export async function getReminderCronStatus(): Promise<ReminderCronStatus | null> {
  const container = getContainer();
  try {
    const { resource } = await container.item("cronStatus::reminders", "system").read<ReminderCronStatus>();
    return resource ?? null;
  } catch {
    return null;
  }
}
