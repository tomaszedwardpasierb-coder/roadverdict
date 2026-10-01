import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashToken } from "@/lib/auth/crypto";

// A tiny in-memory stand-in for the one Cosmos container.
const store = new Map<string, Record<string, unknown>>();
const key = (id: string, pk: string) => `${pk}::${id}`;

vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    items: {
      create: async (doc: Record<string, unknown>) => void store.set(key(doc.id as string, doc.pk as string), { ...doc }),
      upsert: async (doc: Record<string, unknown>) => void store.set(key(doc.id as string, doc.pk as string), { ...doc }),
      query: (_q: unknown, opts: { partitionKey: string }) => ({
        fetchAll: async () => ({
          resources: [...store.values()]
            .filter((d) => d.pk === opts.partitionKey && d.type === "trustedDevice")
            .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
        }),
      }),
    },
    item: (id: string, pk: string) => ({
      read: async () => ({ resource: store.get(key(id, pk)) }),
      delete: async () => void store.delete(key(id, pk)),
    }),
  }),
}));

import {
  createTrustedDevice,
  listTrustedDevices,
  MAX_TRUSTED_DEVICES,
  removeAllTrustedDevices,
  removeTrustedDevice,
  verifyTrustedDevice,
} from "@/lib/auth/trustedDevice";

const OWNER = "rider@example.com";

beforeEach(() => store.clear());

describe("trusted devices", () => {
  it("stores only the secret's hash, never the secret", async () => {
    const created = await createTrustedDevice(OWNER, "Pixel 7");
    if (!created.ok) throw new Error("expected ok");
    const saved = store.get(key(created.device.id, OWNER))!;
    expect(saved.secretHash).toBe(hashToken(created.secret));
    expect(JSON.stringify(saved)).not.toContain(created.secret);
    expect(created.device).toMatchObject({ name: "Pixel 7", lastUsedAt: null });
  });

  it("accepts the phone's own secret, and records when it was used", async () => {
    const created = await createTrustedDevice(OWNER, "Pixel 7");
    if (!created.ok) throw new Error("expected ok");
    expect(await verifyTrustedDevice(OWNER, created.device.id, created.secret)).toBe(true);
    expect((await listTrustedDevices(OWNER))[0].lastUsedAt).not.toBeNull();
  });

  it("refuses a wrong secret, an unknown phone, or someone else's phone", async () => {
    const created = await createTrustedDevice(OWNER, "Pixel 7");
    if (!created.ok) throw new Error("expected ok");
    expect(await verifyTrustedDevice(OWNER, created.device.id, "not-the-secret")).toBe(false);
    expect(await verifyTrustedDevice(OWNER, "no-such-device", created.secret)).toBe(false);
    expect(await verifyTrustedDevice("someone-else@example.com", created.device.id, created.secret)).toBe(false);
    expect(await verifyTrustedDevice(OWNER, "", "")).toBe(false);
  });

  it("stops at the limit", async () => {
    for (let i = 0; i < MAX_TRUSTED_DEVICES; i++) expect((await createTrustedDevice(OWNER, `Phone ${i}`)).ok).toBe(true);
    expect(await createTrustedDevice(OWNER, "One too many")).toEqual({ ok: false, reason: "limit_reached" });
  });

  it("a removed phone can't open anything any more", async () => {
    const created = await createTrustedDevice(OWNER, "Pixel 7");
    if (!created.ok) throw new Error("expected ok");
    expect(await removeTrustedDevice(OWNER, created.device.id)).toBe(true);
    expect(await verifyTrustedDevice(OWNER, created.device.id, created.secret)).toBe(false);
    expect(await removeTrustedDevice(OWNER, created.device.id)).toBe(false);
  });

  it("removes them all, and only the owner's", async () => {
    await createTrustedDevice(OWNER, "A");
    await createTrustedDevice(OWNER, "B");
    await createTrustedDevice("someone-else@example.com", "C");
    await removeAllTrustedDevices(OWNER);
    expect(await listTrustedDevices(OWNER)).toEqual([]);
    expect(await listTrustedDevices("someone-else@example.com")).toHaveLength(1);
  });

  it("names a phone sensibly when the name is blank or long", async () => {
    const blank = await createTrustedDevice(OWNER, "   ");
    const long = await createTrustedDevice(OWNER, "x".repeat(200));
    if (!blank.ok || !long.ok) throw new Error("expected ok");
    expect(blank.device.name).toBe("Phone");
    expect(long.device.name).toHaveLength(60);
  });
});
