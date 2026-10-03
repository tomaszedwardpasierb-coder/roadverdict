// The demo's per-visitor and whole-site daily limits.
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ counts: new Map<string, number>() }));

vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    item: (id: string) => ({
      patch: async () => {
        if (!store.counts.has(id)) throw Object.assign(new Error("missing"), { code: 404 });
        store.counts.set(id, (store.counts.get(id) as number) + 1);
        return { resource: { count: store.counts.get(id) } };
      },
    }),
    items: {
      create: async (doc: { id: string; count: number }) => {
        store.counts.set(doc.id, doc.count);
      },
    },
  }),
}));

import { demoEnabled, takeDemoUse } from "@/lib/demo/demoUsage";

beforeEach(() => store.counts.clear());

describe("takeDemoUse", () => {
  it("lets a visitor use their share, then refuses the next one", async () => {
    for (let i = 0; i < 3; i++) expect(await takeDemoUse("scan", "1.2.3.4", { perVisitor: 3, wholeSite: 100 })).toBe("ok");
    expect(await takeDemoUse("scan", "1.2.3.4", { perVisitor: 3, wholeSite: 100 })).toBe("visitor_limit");
  });

  it("counts each visitor separately, but the whole site together", async () => {
    const limits = { perVisitor: 5, wholeSite: 3 };
    expect(await takeDemoUse("ask", "1.1.1.1", limits)).toBe("ok");
    expect(await takeDemoUse("ask", "2.2.2.2", limits)).toBe("ok");
    expect(await takeDemoUse("ask", "3.3.3.3", limits)).toBe("ok");
    expect(await takeDemoUse("ask", "4.4.4.4", limits)).toBe("site_limit");
  });

  it("keeps scans and questions in separate counts, and stores only a scrambled address", async () => {
    const limits = { perVisitor: 1, wholeSite: 100 };
    expect(await takeDemoUse("scan", "9.9.9.9", limits)).toBe("ok");
    expect(await takeDemoUse("ask", "9.9.9.9", limits)).toBe("ok");
    expect([...store.counts.keys()].some((k) => k.includes("9.9.9.9"))).toBe(false);
  });

  it("can be switched off with DEMO_ENABLED=false", () => {
    expect(demoEnabled()).toBe(true);
    process.env.DEMO_ENABLED = "false";
    expect(demoEnabled()).toBe(false);
    delete process.env.DEMO_ENABLED;
  });
});
