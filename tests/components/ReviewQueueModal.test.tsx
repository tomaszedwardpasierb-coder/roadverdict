// Place at: tests/components/ReviewQueueModal.test.tsx
//
// ReviewQueueModal is the receipt-scan review queue: one record at a time,
// committed to the server as each is reached (not the whole batch
// upfront), with tier-1/4 "clean" items (printed date + mileage, nothing
// else wrong) auto-committing without a human step at all. It imports none
// of the three dashboard contexts (ChartFilterContext/TabSwitchContext/
// ScannedReceiptContext - grep on the source file's own imports confirms
// this) and renders no chart, so neither a Provider wrapper nor a
// react-chartjs-2 mock is needed here. Only `fetch` is mocked - every
// other collaborator (MileageConflictModal, AttachmentThumb, the real
// fuelPlausibility/receiptTiering checks) runs for real.
//
// The mock below is a single small router covering every endpoint this
// component and its real children (MileageConflictModal) call, rather
// than one canned response per test - the component fires several
// different requests (commit-receipt-item, the pending-scan-batch sync
// effect, per-category PATCH/DELETE, commit-receipt-items) over the
// course of a single interaction, and a single mockResolvedValue can't
// tell them apart.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewQueueModal } from "@/app/dashboard/ReviewQueueModal";
import type { ParsedReceiptItem } from "@/lib/tracker/receiptParse";
import type { Attachment } from "@/lib/tracker/cosmosHelpers";

let attachmentCounter = 0;
function makeAttachment(): Attachment {
  attachmentCounter += 1;
  return {
    blobName: `blob-${attachmentCounter}`,
    fileName: `receipt-${attachmentCounter}.jpg`,
    fileType: "image/jpeg",
    uploadedAt: "2024-01-01T00:00:00.000Z",
  };
}

function makeItem(overrides: Partial<ParsedReceiptItem> & { category: ParsedReceiptItem["category"] }): ParsedReceiptItem {
  return {
    fileName: "receipt.jpg",
    date: "2024-01-01",
    costGbp: 50,
    description: "Item",
    litres: null,
    mileageOnReceipt: null,
    registrationOnReceipt: null,
    merchantName: null,
    address: null,
    city: null,
    vehicleMakeOnReceipt: null,
    vehicleModelOnReceipt: null,
    attachment: makeAttachment(),
    forceReview: false,
    ...overrides,
  };
}

// Real jsonRes shape mimics only what the component actually reads off a
// fetch Response (`ok` and `.json()`) - nothing here pretends to be a
// real Response otherwise.
function jsonRes(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

function createFetchMock(opts: {
  commitItem?: (item: ParsedReceiptItem) => { entry?: unknown; networkError?: boolean; pending?: boolean } | undefined;
  commitItems?: (items: ParsedReceiptItem[]) => { ok: boolean; data?: Record<string, unknown>; networkError?: boolean };
}) {
  return vi.fn(async (url: string, init?: RequestInit): Promise<any> => {
    const method = (init?.method ?? "GET").toUpperCase();

    if (url === "/api/tracker/commit-receipt-item" && method === "POST") {
      const { item } = JSON.parse(init!.body as string);
      const result = opts.commitItem?.(item);
      if (!result) return jsonRes({ error: "no commitItem handler matched this item in the test" }, false);
      if (result.pending) return new Promise(() => {});
      if (result.networkError) throw new Error("network down");
      return jsonRes({ entry: result.entry });
    }

    // The batch-sync effect (fires on every `committed` change) and the
    // "Finish later" cleanup DELETE both hit this same endpoint - neither
    // is under test here, so it's always a no-op success.
    if (url === "/api/tracker/pending-scan-batch") {
      return jsonRes({});
    }

    if (url === "/api/tracker/commit-receipt-items" && method === "POST") {
      const { items } = JSON.parse(init!.body as string);
      const result = opts.commitItems?.(items) ?? { ok: true, data: {} };
      if (result.networkError) throw new Error("network down");
      return jsonRes(result.data ?? {}, result.ok);
    }

    // Per-record PATCH (save / markEntryReviewed / MileageConflictModal's
    // own patches) and DELETE (duplicate/mismatch removal) always succeed
    // - no test here depends on either failing.
    if (method === "PATCH" || method === "DELETE") {
      return jsonRes({});
    }

    return jsonRes({ error: `unhandled ${method} ${url}` }, false);
  });
}

function fetchCalls(fetchMock: ReturnType<typeof createFetchMock>): [string, RequestInit | undefined][] {
  return fetchMock.mock.calls as [string, RequestInit | undefined][];
}

function patchCallsTo(fetchMock: ReturnType<typeof createFetchMock>, url: string) {
  return fetchCalls(fetchMock)
    .filter((call) => call[0] === url && (call[1]?.method ?? "").toUpperCase() === "PATCH")
    .map((call) => JSON.parse(call[1]!.body as string));
}

describe("ReviewQueueModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sorts items into tier order (not upload order), and a forceReview flag keeps a clean tier-1 item under human review", async () => {
    const fuelItem = makeItem({ category: "fuel", date: "2024-03-01", description: "Fuel A" }); // tier 6 (no mileage)
    const serviceItem = makeItem({ category: "service", mileageOnReceipt: 1000, forceReview: true, date: "2024-01-01", description: "Service B" }); // tier 1, but forced dirty

    const fetchMock = createFetchMock({
      commitItem: (item) => {
        if (item.description === "Fuel A") {
          return { entry: { id: "fuel-a", category: "fuel", aiDescription: "Fuel A AI", duplicate: null, litres: 5, cost: 20, mileage: 2000, mileageNeedsManualEntry: false, plateMismatch: null, vehicleMismatch: null, date: "2024-03-01", filledToFull: true, attachment: makeAttachment() } };
        }
        if (item.description === "Service B") {
          return { entry: { id: "svc-b", category: "service", aiDescription: "Service B AI", duplicate: null, jobType: "other", cost: 50, mileage: 1000, mileageNeedsManualEntry: false, plateMismatch: null, vehicleMismatch: null, date: "2024-01-01", notes: "", attachment: makeAttachment() } };
        }
        return undefined;
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ReviewQueueModal parsedItems={[fuelItem, serviceItem]} onFinished={vi.fn()} />);

    // Passed in fuel-then-service order, but service (tier 1) is sorted
    // ahead of fuel (tier 6) - and shown as a real review step, not
    // auto-committed, because forceReview marks it dirty.
    expect(await screen.findByText("Service B AI")).toBeInTheDocument();
    expect(screen.getByText("Reviewing 1 of 2")).toBeInTheDocument();
    expect(screen.queryByText("Logging clear entries automatically")).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Skip" }));

    expect(await screen.findByText("Fuel A AI")).toBeInTheDocument();
    expect(screen.getByText("Reviewing 2 of 2")).toBeInTheDocument();

    // Skip never saves anything.
    expect(fetchCalls(fetchMock).filter((call) => (call[1]?.method ?? "").toUpperCase() === "PATCH")).toHaveLength(0);
  });

  it("auto-commits a clean tier-1 item with no human step, then marks it reviewed server-side", async () => {
    const item = makeItem({ category: "service", mileageOnReceipt: 500, description: "Oil change" });
    const fetchMock = createFetchMock({
      commitItem: (i) =>
        i.description === "Oil change"
          ? { entry: { id: "svc-1", category: "service", aiDescription: "Oil change AI", duplicate: null, jobType: "oil-filter", cost: 80, mileage: 500, mileageNeedsManualEntry: false, plateMismatch: null, vehicleMismatch: null, date: "2024-01-01", notes: "", attachment: makeAttachment() } }
          : undefined,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ReviewQueueModal parsedItems={[item]} onFinished={vi.fn()} />);

    expect(await screen.findByText("All caught up")).toBeInTheDocument();
    expect(screen.getByText("1 entry added from this scan.")).toBeInTheDocument();

    // markEntryReviewed re-saves the auto-committed record's own values
    // purely to clear its needsReview flag - never touched by the human.
    const calls = patchCallsTo(fetchMock, "/api/tracker/services/svc-1");
    expect(calls).toEqual([{ jobType: "oil-filter", cost: 80, mileage: 500, date: "2024-01-01", notes: "", mileageAcknowledged: true }]);
  });

  it("a fuel item with a printed mileage (tier 4) still requires human review when its litres reading is physically implausible", async () => {
    const item = makeItem({ category: "fuel", mileageOnReceipt: 8000, litres: 30, description: "Big fill" });
    const fetchMock = createFetchMock({
      commitItem: (i) =>
        i.description === "Big fill"
          ? { entry: { id: "fuel-2", category: "fuel", aiDescription: "Big fill AI", duplicate: null, litres: 30, cost: 45, mileage: 8000, mileageNeedsManualEntry: false, plateMismatch: null, vehicleMismatch: null, date: "2024-01-01", filledToFull: true, attachment: makeAttachment() } }
          : undefined,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ReviewQueueModal parsedItems={[item]} onFinished={vi.fn()} />);

    const litresInput = await screen.findByLabelText("Litres");
    expect(litresInput).toHaveValue(30);
    expect(screen.getByText(/is more than this bike's tank can hold/)).toBeInTheDocument();
    expect(screen.queryByText("Logging clear entries automatically")).not.toBeInTheDocument();
  });

  it("tier-2 items make mileage optional, and saving PATCHes the record's own category route with real form state", async () => {
    const item = makeItem({ category: "mods", description: "Chain lube" });
    const fetchMock = createFetchMock({
      commitItem: (i) =>
        i.description === "Chain lube"
          ? { entry: { id: "mod-1", category: "mods", aiDescription: "Chain lube AI", duplicate: null, name: "Chain lube", modCategory: "other-accessory", cost: 12, mileage: 3000, mileageNeedsManualEntry: false, plateMismatch: null, vehicleMismatch: null, date: "2024-01-01", notes: "", attachment: makeAttachment() } }
          : undefined,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ReviewQueueModal parsedItems={[item]} onFinished={vi.fn()} />);

    const mileageInput = await screen.findByLabelText("Mileage");
    expect(mileageInput).not.toBeRequired();
    expect(mileageInput).toHaveAttribute("placeholder", "Optional");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Save and next" }));

    expect(await screen.findByText("All caught up")).toBeInTheDocument();
    const calls = patchCallsTo(fetchMock, "/api/tracker/mods/mod-1");
    expect(calls).toEqual([{ category: "other-accessory", name: "Chain lube", cost: 12, mileage: 3000, date: "2024-01-01", notes: "", batchHints: [] }]);
  });

  it("shows the duplicate warning, and deleting the new entry removes it from the batch entirely", async () => {
    const item = makeItem({ category: "service", description: "Second oil change" });
    const fetchMock = createFetchMock({
      commitItem: (i) =>
        i.description === "Second oil change"
          ? {
              entry: {
                id: "svc-2",
                category: "service",
                aiDescription: "Second oil change AI",
                duplicate: { id: "existing-1", date: "2023-12-01", cost: 75, description: "Oil change" },
                jobType: "other",
                cost: 75,
                mileage: 1000,
                mileageNeedsManualEntry: false,
                plateMismatch: null,
                vehicleMismatch: null,
                date: "2024-01-01",
                notes: "",
                attachment: makeAttachment(),
              },
            }
          : undefined,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ReviewQueueModal parsedItems={[item]} onFinished={vi.fn()} />);

    expect(await screen.findByText(/This might already be logged/)).toBeInTheDocument();
    expect(screen.getByText("Oil change")).toBeInTheDocument();
    expect(screen.getByText(/£75\.00/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete this new entry" }));

    expect(await screen.findByText("Nothing left to review from this scan.")).toBeInTheDocument();
    expect(fetchCalls(fetchMock).some((call) => call[0] === "/api/tracker/services/svc-2" && (call[1]?.method ?? "").toUpperCase() === "DELETE")).toBe(true);
  });

  it("shows both vehicle-make and plate mismatch warnings together, with a single delete action", async () => {
    const item = makeItem({ category: "mods", description: "Mystery part", vehicleMakeOnReceipt: "Yamaha", registrationOnReceipt: "AB12CDE" });
    const fetchMock = createFetchMock({
      commitItem: (i) =>
        i.description === "Mystery part"
          ? {
              entry: {
                id: "mod-3",
                category: "mods",
                aiDescription: "Mystery part AI",
                duplicate: null,
                name: "Mystery part",
                modCategory: "other-accessory",
                cost: 20,
                mileage: 1000,
                mileageNeedsManualEntry: false,
                plateMismatch: { registrationOnReceipt: "AB12CDE" },
                vehicleMismatch: { makeOnReceipt: "Yamaha", modelOnReceipt: "MT-07" },
                date: "2024-01-01",
                notes: "",
                attachment: makeAttachment(),
              },
            }
          : undefined,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ReviewQueueModal parsedItems={[item]} onFinished={vi.fn()} />);

    expect(await screen.findByText(/looks like it's for a/)).toBeInTheDocument();
    expect(screen.getByText("Yamaha MT-07")).toBeInTheDocument();
    expect(screen.getByText(/isn't a plate this bike has ever used/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete this entry" })).toBeInTheDocument();
  });

  it("Prev skips back over an already auto-committed clean item to the nearest one that actually needed review", async () => {
    const items = [
      makeItem({ category: "service", mileageOnReceipt: 1000, date: "2024-01-01", description: "Service Auto" }), // tier 1, clean
      makeItem({ category: "service", mileageOnReceipt: 2000, date: "2024-02-01", forceReview: true, description: "Service Forced" }), // tier 1, forced dirty
      makeItem({ category: "mods", date: "2024-03-01", description: "Mod Manual" }), // tier 2
    ];
    const fetchMock = createFetchMock({
      commitItem: (i) => {
        if (i.description === "Service Auto") return { entry: { id: "auto-1", category: "service", aiDescription: "Service Auto AI", duplicate: null, jobType: "other", cost: 10, mileage: 1000, mileageNeedsManualEntry: false, plateMismatch: null, vehicleMismatch: null, date: "2024-01-01", notes: "", attachment: makeAttachment() } };
        if (i.description === "Service Forced") return { entry: { id: "forced-1", category: "service", aiDescription: "Service Forced AI", duplicate: null, jobType: "other", cost: 20, mileage: 2000, mileageNeedsManualEntry: false, plateMismatch: null, vehicleMismatch: null, date: "2024-02-01", notes: "", attachment: makeAttachment() } };
        if (i.description === "Mod Manual") return { entry: { id: "mod-2", category: "mods", aiDescription: "Mod Manual AI", duplicate: null, name: "Mod Manual", modCategory: "other-accessory", cost: 5, mileage: 2500, mileageNeedsManualEntry: false, plateMismatch: null, vehicleMismatch: null, date: "2024-03-01", notes: "", attachment: makeAttachment() } };
        return undefined;
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ReviewQueueModal parsedItems={items} onFinished={vi.fn()} />);

    // Service Auto never appears - it auto-commits, landing straight on
    // the forced-dirty item.
    expect(await screen.findByText("Service Forced AI")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(await screen.findByText("Mod Manual AI")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "← Prev" }));

    expect(await screen.findByText("Service Forced AI")).toBeInTheDocument();
    expect(screen.getByText("Reviewing 2 of 3")).toBeInTheDocument();
  });

  it("Finish later: commits every still-unreviewed item in one pass, then closes cleanly on full success", async () => {
    const items = [makeItem({ category: "mods", description: "Item One" }), makeItem({ category: "mods", description: "Item Two" })];
    const onFinished = vi.fn();
    const fetchMock = createFetchMock({
      commitItem: (i) =>
        i.description === "Item One"
          ? { entry: { id: "one", category: "mods", aiDescription: "Item One AI", duplicate: null, name: "Item One", modCategory: "other-accessory", cost: 5, mileage: 100, mileageNeedsManualEntry: false, plateMismatch: null, vehicleMismatch: null, date: "2024-01-01", notes: "", attachment: makeAttachment() } }
          : undefined,
      commitItems: (remaining) => {
        expect(remaining).toHaveLength(1);
        expect(remaining[0].description).toBe("Item Two");
        return { ok: true, data: { createdCount: 1, failedCount: 0 } };
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ReviewQueueModal parsedItems={items} onFinished={onFinished} />);
    await screen.findByText("Item One AI");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Finish later" }));

    await vi.waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
    expect(fetchCalls(fetchMock).some((call) => call[0] === "/api/tracker/pending-scan-batch" && (call[1]?.method ?? "").toUpperCase() === "DELETE")).toBe(true);
  });

  it("Finish later: a partial failure keeps only the failed items in the queue and reports exactly how many did and didn't save", async () => {
    const items = [makeItem({ category: "mods", description: "Item One" }), makeItem({ category: "mods", description: "Item Two" })];
    const fetchMock = createFetchMock({
      commitItem: (i) => {
        if (i.description === "Item One") return { entry: { id: "one", category: "mods", aiDescription: "Item One AI", duplicate: null, name: "Item One", modCategory: "other-accessory", cost: 5, mileage: 100, mileageNeedsManualEntry: false, plateMismatch: null, vehicleMismatch: null, date: "2024-01-01", notes: "", attachment: makeAttachment() } };
        if (i.description === "Item Two") return { entry: { id: "two", category: "mods", aiDescription: "Item Two AI", duplicate: null, name: "Item Two", modCategory: "other-accessory", cost: 6, mileage: 200, mileageNeedsManualEntry: false, plateMismatch: null, vehicleMismatch: null, date: "2024-01-02", notes: "", attachment: makeAttachment() } };
        return undefined;
      },
      // Echoes back whatever was sent as failedItems, so the retried
      // commit for the same item downstream is exercised for real too.
      commitItems: (remaining) => ({ ok: true, data: { createdCount: 0, failedCount: remaining.length, failedItems: remaining } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ReviewQueueModal parsedItems={items} onFinished={vi.fn()} />);
    await screen.findByText("Item One AI");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Finish later" }));

    expect(await screen.findByText(/0 of 1 saved\. 1 couldn't be saved and is still waiting here below/)).toBeInTheDocument();
    // The queue shrank down to exactly the one that failed, and it's
    // being re-attempted from scratch.
    expect(screen.getByText("Reviewing 1 of 1")).toBeInTheDocument();
    expect(await screen.findByText("Item Two AI")).toBeInTheDocument();
  });

  it("Finish later: a network failure leaves the batch untouched and shows a reassuring, specific error", async () => {
    const items = [makeItem({ category: "mods", description: "Item One" }), makeItem({ category: "mods", description: "Item Two" })];
    const onFinished = vi.fn();
    const fetchMock = createFetchMock({
      commitItem: (i) =>
        i.description === "Item One"
          ? { entry: { id: "one", category: "mods", aiDescription: "Item One AI", duplicate: null, name: "Item One", modCategory: "other-accessory", cost: 5, mileage: 100, mileageNeedsManualEntry: false, plateMismatch: null, vehicleMismatch: null, date: "2024-01-01", notes: "", attachment: makeAttachment() } }
          : undefined,
      commitItems: () => ({ ok: false, networkError: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ReviewQueueModal parsedItems={items} onFinished={onFinished} />);
    await screen.findByText("Item One AI");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Finish later" }));

    expect(await screen.findByText(/Couldn't reach the server\. Your receipts are still safely waiting here/)).toBeInTheDocument();
    expect(onFinished).not.toHaveBeenCalled();
    // Still on the same item - nothing was reset.
    expect(screen.getByText("Item One AI")).toBeInTheDocument();
  });

  it("a real mileage conflict resolves through MileageConflictModal's own 'keep both' path, PATCHing the exact body QueueItemForm builds", async () => {
    const peer = makeItem({ category: "service", mileageOnReceipt: 6000, date: "2024-01-01", description: "Earlier Service" }); // tier 1, clean -> auto-commits
    const fuel = makeItem({ category: "fuel", litres: 10, date: "2024-02-01", description: "Fuel X" }); // tier 6, always reviewed

    const fetchMock = createFetchMock({
      commitItem: (i) => {
        if (i.description === "Earlier Service") {
          return { entry: { id: "svc-e", category: "service", aiDescription: "Earlier Service AI", duplicate: null, jobType: "other", cost: 30, mileage: 6000, mileageNeedsManualEntry: false, plateMismatch: null, vehicleMismatch: null, date: "2024-01-01", notes: "", attachment: makeAttachment() } };
        }
        if (i.description === "Fuel X") {
          return {
            entry: {
              id: "fuel-x",
              category: "fuel",
              aiDescription: "Fuel X AI",
              duplicate: null,
              litres: 10,
              cost: 20,
              mileage: 5000,
              mileageNeedsManualEntry: true,
              mileageWarningText: "The receipt appears to show 5000 mi, earlier than a later reading of 6000 mi.",
              mileageConflictReferenceBatchIndex: 0,
              plateMismatch: null,
              vehicleMismatch: null,
              date: "2024-02-01",
              filledToFull: true,
              attachment: makeAttachment(),
            },
          };
        }
        return undefined;
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ReviewQueueModal parsedItems={[peer, fuel]} onFinished={vi.fn()} />);

    // "Earlier Service" auto-commits invisibly; the fuel item lands as the
    // very first thing shown to the human, already flagged.
    expect(await screen.findByText("Fuel X AI")).toBeInTheDocument();
    expect(screen.getByText(/The receipt appears to show 5000 mi/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Resolve" }));

    expect(await screen.findByText("Mileage conflict")).toBeInTheDocument();
    expect(screen.getByText("Earlier Service")).toBeInTheDocument(); // the batch peer's own description, as the reference label

    const keepBothButton = await screen.findByRole("button", { name: /Keep both as they are/ });
    await user.click(keepBothButton);

    expect(await screen.findByText("All caught up")).toBeInTheDocument();
    expect(screen.getByText("2 entries added from this scan.")).toBeInTheDocument();

    const calls = patchCallsTo(fetchMock, "/api/tracker/fuel/fuel-x");
    expect(calls).toEqual([{ litres: 10, cost: 20, mileage: 5000, date: "2024-02-01", filledToFull: true, mileageAcknowledged: true, mileageAnomaly: true }]);
  });

  it("a failed commit shows a real retry button, and Retry genuinely re-issues the request", async () => {
    let attempts = 0;
    const item = makeItem({ category: "service", description: "Retry Item" });
    const fetchMock = createFetchMock({
      commitItem: (i) => {
        if (i.description !== "Retry Item") return undefined;
        attempts += 1;
        if (attempts === 1) return { networkError: true };
        return { entry: { id: "retry-1", category: "service", aiDescription: "Retry Item AI", duplicate: null, jobType: "other", cost: 10, mileage: 1000, mileageNeedsManualEntry: false, plateMismatch: null, vehicleMismatch: null, date: "2024-01-01", notes: "", attachment: makeAttachment() } };
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ReviewQueueModal parsedItems={[item]} onFinished={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Retry Item AI")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it("'Taking a while - let me review this one myself' escapes the auto-commit screen even while the commit is still pending", async () => {
    const item = makeItem({ category: "service", mileageOnReceipt: 500, description: "Slow Auto" });
    const fetchMock = createFetchMock({
      commitItem: (i) => (i.description === "Slow Auto" ? { pending: true } : undefined),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ReviewQueueModal parsedItems={[item]} onFinished={vi.fn()} />);

    expect(await screen.findByText("Logging clear entries automatically")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Taking a while - let me review this one myself" }));

    // The commit still hasn't resolved (it never will, in this test), so
    // there's still no entry to show a form for - but the messaging and
    // escape hatch are now the per-item ones, not the batch-wide one.
    expect(await screen.findByText("Saving this entry…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Taking a while - try again" })).toBeInTheDocument();
    expect(screen.queryByText("Logging clear entries automatically")).not.toBeInTheDocument();
  });

  it("an empty batch shows the done screen immediately, with no requests fired at all", () => {
    const fetchMock = createFetchMock({});
    vi.stubGlobal("fetch", fetchMock);

    render(<ReviewQueueModal parsedItems={[]} onFinished={vi.fn()} />);

    expect(screen.getByText("All caught up")).toBeInTheDocument();
    expect(screen.getByText("Nothing left to review from this scan.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("service fields: shows the Job picker and Notes, with the printed-mileage field required for a tier-1 receipt", async () => {
    const item = makeItem({ category: "service", description: "Full service" });
    const fetchMock = createFetchMock({
      commitItem: (i) =>
        i.description === "Full service"
          ? { entry: { id: "svc-fields", category: "service", aiDescription: "Full service AI", duplicate: null, jobType: "basic-service", cost: 90, mileage: 4000, mileageNeedsManualEntry: false, plateMismatch: null, vehicleMismatch: null, date: "2024-01-01", notes: "", attachment: makeAttachment() } }
          : undefined,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ReviewQueueModal parsedItems={[item]} onFinished={vi.fn()} />);

    expect(await screen.findByLabelText("Job")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Basic service" })).toBeInTheDocument();
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
    // No mileage was on the receipt (tier 2 here), so it's optional.
    expect(screen.getByLabelText("Mileage")).not.toBeRequired();
  });

  it("fuel fields: shows Litres (always required) and the filled-to-full checkbox, with no Notes field", async () => {
    const item = makeItem({ category: "fuel", litres: 8, mileageOnReceipt: 9000, forceReview: true, description: "Fill-up" });
    const fetchMock = createFetchMock({
      commitItem: (i) =>
        i.description === "Fill-up"
          ? { entry: { id: "fuel-fields", category: "fuel", aiDescription: "Fill-up AI", duplicate: null, litres: 8, cost: 15, mileage: 9000, mileageNeedsManualEntry: false, plateMismatch: null, vehicleMismatch: null, date: "2024-01-01", filledToFull: true, attachment: makeAttachment() } }
          : undefined,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ReviewQueueModal parsedItems={[item]} onFinished={vi.fn()} />);

    const litresInput = await screen.findByLabelText("Litres");
    expect(litresInput).toBeRequired();
    expect(screen.getByLabelText("Filled the tank completely full")).toBeChecked();
    expect(screen.queryByLabelText("Notes")).not.toBeInTheDocument();
    // A tier-4 item has a printed mileage, so the field is required.
    expect(screen.getByLabelText("Mileage")).toBeRequired();
  });

  it("mods fields: 'What is it?' is required and shows the sub-category note, mileage optional", async () => {
    const item = makeItem({ category: "mods", description: "USB charger" });
    const fetchMock = createFetchMock({
      commitItem: (i) =>
        i.description === "USB charger"
          ? { entry: { id: "mod-fields", category: "mods", aiDescription: "USB charger AI", duplicate: null, name: "USB charger", modCategory: "other-accessory", cost: 15, mileage: 1200, mileageNeedsManualEntry: false, plateMismatch: null, vehicleMismatch: null, date: "2024-01-01", notes: "", attachment: makeAttachment() } }
          : undefined,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ReviewQueueModal parsedItems={[item]} onFinished={vi.fn()} />);

    const nameInput = await screen.findByLabelText("What is it?");
    expect(nameInput).toBeRequired();
    expect(nameInput).toHaveValue("USB charger");
    expect(screen.getByText(/Other accessory - change the specific category/)).toBeInTheDocument();
    expect(screen.getByLabelText("Mileage")).not.toBeRequired();
  });

  it("bills fields: shows the bill-Type picker and Notes, with no mileage field at all", async () => {
    const item = makeItem({ category: "bills", description: "MOT" });
    const fetchMock = createFetchMock({
      commitItem: (i) => (i.description === "MOT" ? { entry: { id: "bill-fields", category: "bills", aiDescription: "MOT AI", duplicate: null, billType: "mot-test", cost: 55, plateMismatch: null, vehicleMismatch: null, date: "2024-01-01", notes: "", attachment: makeAttachment() } } : undefined),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ReviewQueueModal parsedItems={[item]} onFinished={vi.fn()} />);

    expect(await screen.findByLabelText("Type")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "MOT test" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Insurance" })).toBeInTheDocument();
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
    expect(screen.queryByLabelText("Mileage")).not.toBeInTheDocument();
  });

  it("live fuel-fill plausibility: an implausibly short distance for a full tank shows the real computed mpg, not a canned message", async () => {
    const item = makeItem({ category: "fuel", litres: 2, date: "2024-03-01", description: "Small top-up" });
    const fetchMock = createFetchMock({
      commitItem: (i) =>
        i.description === "Small top-up"
          ? { entry: { id: "fuel-warn", category: "fuel", aiDescription: "Small top-up AI", duplicate: null, litres: 2, cost: 5, mileage: 1005, mileageNeedsManualEntry: false, plateMismatch: null, vehicleMismatch: null, date: "2024-03-01", filledToFull: true, attachment: makeAttachment(), precedingFuelMileage: 1000 } }
          : undefined,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ReviewQueueModal parsedItems={[item]} onFinished={vi.fn()} />);

    await screen.findByText("Small top-up AI");
    // 2L / 4.546 = ~0.44 gallons over 5 miles => ~11mpg, well under the
    // 15mpg floor checkFullTankPlausibility treats as physically possible.
    expect(screen.getByText(/11 mpg/)).toBeInTheDocument();
    expect(screen.getByText(/still too low to be realistic/)).toBeInTheDocument();
  });
});
