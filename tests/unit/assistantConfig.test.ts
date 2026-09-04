import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  upsert: vi.fn(),
  create: vi.fn(),
  fetchAll: vi.fn(),
  deleteFn: vi.fn(),
}));

const mockContainer = {
  item: vi.fn(() => ({ read: mocks.read, delete: mocks.deleteFn })),
  items: {
    upsert: mocks.upsert,
    create: mocks.create,
    query: vi.fn(() => ({ fetchAll: mocks.fetchAll })),
  },
};
vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));

import {
  getAssistantConfig,
  updateKnowledgeBase,
  updatePersonalityConfig,
  getKnowledgeBaseVersions,
  getPersonalityVersions,
  pruneKnowledgeBaseVersions,
  prunePersonalityVersions,
  type PersonalitySlot,
} from "@/lib/tracker/assistantConfig";

const existingConfig = {
  id: "assistantConfig",
  pk: "system",
  type: "assistantConfig",
  knowledgeBase: "old knowledge",
  personalityEnabled: false,
  activePersonalityId: null,
  personalities: [{ id: "1", name: "", body: "" }, { id: "2", name: "", body: "" }, { id: "3", name: "", body: "" }] as [PersonalitySlot, PersonalitySlot, PersonalitySlot],
  knowledgeBaseUpdatedAt: "2025-01-01T00:00:00.000Z",
  personalityUpdatedAt: "2025-01-01T00:00:00.000Z",
};

describe("getAssistantConfig", () => {
  beforeEach(() => mocks.read.mockReset());

  it("returns the config document when it exists", async () => {
    mocks.read.mockResolvedValue({ resource: existingConfig });
    expect(await getAssistantConfig()).toEqual(existingConfig);
  });

  it("returns null when no config document exists yet", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await getAssistantConfig()).toBeNull();
  });

  it("fails soft to null if the read itself throws", async () => {
    mockContainer.item.mockReturnValueOnce({ read: vi.fn(async () => { throw new Error("cosmos unavailable"); }), delete: mocks.deleteFn });
    expect(await getAssistantConfig()).toBeNull();
  });
});

describe("updateKnowledgeBase", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.read.mockResolvedValue({ resource: existingConfig });
    mocks.upsert.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue(undefined);
  });

  it("throws with a clear message when no config exists yet, rather than creating one implicitly", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    await expect(updateKnowledgeBase("new content")).rejects.toThrow("Run the seed migration first");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("upserts the updated config with the new content", async () => {
    await updateKnowledgeBase("new knowledge");
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ knowledgeBase: "new knowledge" }));
  });

  // The version-history pattern the source comments describe: every
  // save writes both the live config AND a new append-only snapshot,
  // so the history includes the current state as its own most recent
  // entry rather than only "what it used to be before this edit."
  it("also creates a version snapshot recording the same content", async () => {
    await updateKnowledgeBase("new knowledge");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      type: "knowledgeBaseVersion",
      content: "new knowledge",
    }));
  });

  it("does not touch the personality fields when only the knowledge base is updated", async () => {
    await updateKnowledgeBase("new knowledge");
    const updated = mocks.upsert.mock.calls[0][0];
    expect(updated.personalityEnabled).toBe(existingConfig.personalityEnabled);
    expect(updated.personalities).toEqual(existingConfig.personalities);
  });
});

describe("updatePersonalityConfig", () => {
  const newPersonalities: [PersonalitySlot, PersonalitySlot, PersonalitySlot] = [
    { id: "1", name: "Friendly", body: "Be warm and casual." },
    { id: "2", name: "", body: "" },
    { id: "3", name: "", body: "" },
  ];

  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.read.mockResolvedValue({ resource: existingConfig });
    mocks.upsert.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue(undefined);
  });

  it("throws with a clear message when no config exists yet", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    await expect(updatePersonalityConfig(true, "1", newPersonalities)).rejects.toThrow("Run the seed migration first");
  });

  it("upserts the updated personality settings", async () => {
    await updatePersonalityConfig(true, "1", newPersonalities);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      personalityEnabled: true,
      activePersonalityId: "1",
      personalities: newPersonalities,
    }));
  });

  it("also creates a matching version snapshot", async () => {
    await updatePersonalityConfig(true, "1", newPersonalities);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      type: "personalityVersion",
      personalityEnabled: true,
      personalities: newPersonalities,
    }));
  });

  it("does not touch the knowledge base when only personality settings are updated", async () => {
    await updatePersonalityConfig(true, "1", newPersonalities);
    const updated = mocks.upsert.mock.calls[0][0];
    expect(updated.knowledgeBase).toBe(existingConfig.knowledgeBase);
  });
});

describe("getKnowledgeBaseVersions / getPersonalityVersions", () => {
  beforeEach(() => mocks.fetchAll.mockReset());

  it("queries knowledge base versions scoped to the system partition, with a default limit of 20", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    await getKnowledgeBaseVersions();
    const [query, options] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.parameters).toEqual([{ name: "@limit", value: 20 }]);
    expect(options).toEqual({ partitionKey: "system" });
  });

  it("respects a custom limit for personality versions", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    await getPersonalityVersions(5);
    const [query] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.parameters).toEqual([{ name: "@limit", value: 5 }]);
  });
});

describe("pruneKnowledgeBaseVersions / prunePersonalityVersions", () => {
  beforeEach(() => {
    mocks.fetchAll.mockReset();
    mocks.deleteFn.mockReset();
    mocks.deleteFn.mockResolvedValue(undefined);
  });

  it("pruneKnowledgeBaseVersions skips the most recent MAX_VERSIONS_KEPT via OFFSET, deleting the rest", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [{ id: "kb1" }, { id: "kb2" }] });
    const count = await pruneKnowledgeBaseVersions();
    expect(mocks.deleteFn).toHaveBeenCalledTimes(2);
    expect(count).toBe(2);
    const [query, options] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.query).toContain("c.type = 'knowledgeBaseVersion'");
    expect(query.query).toContain("OFFSET @keep");
    expect(query.parameters).toEqual([{ name: "@keep", value: 50 }]);
    expect(options).toEqual({ partitionKey: "system" });
  });

  it("prunePersonalityVersions does the same for personalityVersion docs", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [{ id: "pv1" }] });
    const count = await prunePersonalityVersions();
    expect(count).toBe(1);
    const [query] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.query).toContain("c.type = 'personalityVersion'");
  });

  it("returns 0 when there's nothing beyond the kept count", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    expect(await pruneKnowledgeBaseVersions()).toBe(0);
    expect(mocks.deleteFn).not.toHaveBeenCalled();
  });

  it("is best-effort - one failed delete doesn't stop the rest", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [{ id: "kb1" }, { id: "kb2" }] });
    mocks.deleteFn.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("boom"));
    expect(await pruneKnowledgeBaseVersions()).toBe(1);
  });
});