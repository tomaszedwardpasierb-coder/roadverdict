// Place at: tests/components/ScanReceiptButton.test.tsx
//
// ScanReceiptButton is the entry point into the AI receipt scanner: it
// checks for a resumable batch on mount, uploads each selected file to
// /api/tracker/scan-receipt one at a time, combines every returned item
// across every file into ONE true tier-then-date processing order (not
// upload order), persists that combined batch, then hands it to the real
// ReviewQueueModal. Only `fetch` and next/navigation's useRouter are
// mocked - the sequencing, sorting and message copy all run for real.
//
// The card itself is always visible now (no button-to-reveal toggle),
// so every test can go straight for the file input - no "open the
// panel" step needed first.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ScanReceiptButton } from "@/app/dashboard/ScanReceiptButton";

function makeAttachment(name: string) {
  return { blobName: `blob-${name}`, fileName: name, fileType: "image/jpeg" as const, uploadedAt: "2024-01-01T00:00:00.000Z" };
}

function makeItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    fileName: "receipt.jpg",
    category: "service",
    date: "2024-01-01",
    costGbp: 50,
    description: "Oil change",
    litres: null,
    mileageOnReceipt: null,
    registrationOnReceipt: null,
    merchantName: null,
    address: null,
    city: null,
    vehicleMakeOnReceipt: null,
    vehicleModelOnReceipt: null,
    attachment: makeAttachment("receipt.jpg"),
    forceReview: false,
    ...overrides,
  };
}

// A single dispatcher covering every endpoint this component (and the
// real ReviewQueueModal it may open) can call, so each test only needs
// to describe what's DIFFERENT about it rather than re-wiring every
// route from scratch.
function makeFetch(opts: {
  pendingBatchGet?: { batch: { items: unknown[] } | null };
  scanReceipt?: (fileName: string, callIndex: number) => unknown;
}) {
  let scanCallIndex = 0;
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url === "/api/tracker/pending-scan-batch" && method === "GET") {
      return { ok: true, json: async () => ({ batch: opts.pendingBatchGet?.batch ?? null }) };
    }
    if (url === "/api/tracker/pending-scan-batch" && method === "DELETE") {
      return { ok: true, json: async () => ({}) };
    }
    if (url === "/api/tracker/pending-scan-batch" && method === "POST") {
      return { ok: true, json: async () => ({}) };
    }
    if (url === "/api/tracker/scan-receipt" && method === "POST") {
      const formData = init!.body as FormData;
      const file = formData.get("file") as File;
      const result = opts.scanReceipt
        ? await opts.scanReceipt(file.name, scanCallIndex)
        : { ok: true, json: async () => ({ items: [] }) };
      scanCallIndex++;
      return result;
    }
    // Anything else (e.g. ReviewQueueModal's own commit-receipt-item
    // call once the queue opens) - not the focus of this file, kept
    // harmless rather than unhandled.
    return { ok: false, json: async () => ({ error: "not mocked in this test" }) };
  });
}

function jpgFile(name: string) {
  return new File(["fake-image-bytes"], name, { type: "image/jpeg" });
}

function fileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

describe("ScanReceiptButton", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", makeFetch({}));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("checks for a resumable batch on mount and shows no banner when none is pending", async () => {
    const fetchMock = makeFetch({ pendingBatchGet: { batch: null } });
    vi.stubGlobal("fetch", fetchMock);

    render(<ScanReceiptButton />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/tracker/pending-scan-batch"));
    expect(screen.queryByText(/waiting to be reviewed/)).not.toBeInTheDocument();
  });

  it("shows a resume banner with the real pending count, and Resume opens the queue with exactly those items", async () => {
    const pendingItems = [
      makeItem({ description: "Chain lube", category: "service", mileageOnReceipt: null, date: "2024-01-01" }),
      makeItem({ description: "Air filter", category: "mods", mileageOnReceipt: null, date: "2024-01-02" }),
    ];
    const fetchMock = makeFetch({ pendingBatchGet: { batch: { items: pendingItems } } });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ScanReceiptButton />);

    expect(await screen.findByText(/from an earlier scan waiting to be reviewed/)).toBeInTheDocument();
    expect(screen.getByText("2 receipts")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(await screen.findByText("Reviewing 1 of 2")).toBeInTheDocument();
  });

  it("singular phrasing for exactly one pending receipt", async () => {
    const fetchMock = makeFetch({ pendingBatchGet: { batch: { items: [makeItem()] } } });
    vi.stubGlobal("fetch", fetchMock);

    render(<ScanReceiptButton />);
    expect(await screen.findByText(/from an earlier scan waiting to be reviewed/)).toBeInTheDocument();
    expect(screen.getByText("1 receipt")).toBeInTheDocument();
  });

  it("Discard deletes the pending batch server-side and clears the banner", async () => {
    const fetchMock = makeFetch({ pendingBatchGet: { batch: { items: [makeItem()] } } });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ScanReceiptButton />);
    await screen.findByText(/waiting to be reviewed/);

    await user.click(screen.getByRole("button", { name: "Discard" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/tracker/pending-scan-batch", expect.objectContaining({ method: "DELETE" }))
    );
    await waitFor(() => expect(screen.queryByText(/waiting to be reviewed/)).not.toBeInTheDocument());
  });

  it("free plan: the file input does not accept multiple files, and shows the upgrade note", async () => {
    render(<ScanReceiptButton isPro={false} />);

    const input = fileInput();
    expect(input).not.toBeNull();
    expect(input.multiple).toBe(false);
    expect(screen.getByText(/Free plan scans one file at a time\./)).toBeInTheDocument();
  });

  it("pro plan: the file input accepts multiple files, and hides the upgrade note", async () => {
    render(<ScanReceiptButton isPro={true} />);

    const input = fileInput();
    expect(input.multiple).toBe(true);
    expect(screen.queryByText(/Free plan scans one file at a time\./)).not.toBeInTheDocument();
  });

  it("uploads a selected file to /api/tracker/scan-receipt as FormData and reports how many were read", async () => {
    const fetchMock = makeFetch({
      scanReceipt: () => ({
        ok: true,
        json: async () => ({ summary: "1 service item", items: [makeItem()] }),
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ScanReceiptButton isPro={true} />);
    await user.upload(fileInput(), jpgFile("receipt1.jpg"));

    expect(await screen.findByText("✓ Read 1 receipt successfully.")).toBeInTheDocument();
    const scanCall = fetchMock.mock.calls.find((c) => c[0] === "/api/tracker/scan-receipt");
    expect(scanCall).toBeTruthy();
    expect(scanCall![1]!.method).toBe("POST");
    expect(scanCall![1]!.body).toBeInstanceOf(FormData);
    expect((scanCall![1]!.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("a per-file server error is shown against that file's own name, without blocking the others", async () => {
    const fetchMock = makeFetch({
      scanReceipt: (fileName) =>
        fileName === "bad.jpg"
          ? { ok: false, json: async () => ({ error: "Blurry - could not read the total." }) }
          : { ok: true, json: async () => ({ items: [makeItem({ description: "Good one" })] }) },
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ScanReceiptButton isPro={true} />);
    await user.upload(fileInput(), [jpgFile("bad.jpg"), jpgFile("good.jpg")]);

    expect(await screen.findByText("✓ Read 1 receipt successfully.")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 files couldn't be read:")).toBeInTheDocument();
    expect(screen.getByText(/bad\.jpg: Blurry - could not read the total\./)).toBeInTheDocument();
  });

  it("a network failure while scanning a file shows the connection-error message for that file", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/tracker/pending-scan-batch" && method === "GET") {
        return { ok: true, json: async () => ({ batch: null }) };
      }
      if (url === "/api/tracker/scan-receipt") {
        throw new Error("network down");
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ScanReceiptButton />);
    await user.upload(fileInput(), jpgFile("receipt.jpg"));

    expect(await screen.findByText(/receipt\.jpg: Could not reach the server\./)).toBeInTheDocument();
  });

  it("shows the skipped-item notes with correct singular/plural phrasing", async () => {
    const fetchMock = makeFetch({
      scanReceipt: () => ({
        ok: true,
        json: async () => ({
          items: [],
          skippedBeforeProduction: 1,
          skippedNonPetrol: 2,
          skippedUnreadableLitres: 1,
        }),
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ScanReceiptButton />);
    await user.upload(fileInput(), jpgFile("old.jpg"));

    // Singular subject ("1 item") must take the singular verb ("was
    // dated"), not "were dated" - a real grammar bug caught in an
    // earlier version of this redesign.
    expect(await screen.findByText(/1 item was dated before your bike was made and wasn't logged\./)).toBeInTheDocument();
    expect(screen.getByText(/2 fuel items looked like diesel/)).toBeInTheDocument();
    expect(screen.getByText(/1 fuel item couldn't be read clearly enough/)).toBeInTheDocument();
  });

  it("combines items from every file and sorts the whole batch by tier-then-date before opening the review queue", async () => {
    // file1: a fuel item with no mileage (tier 6) and a service item with
    // no mileage (tier 2); file2: a service item with mileage (tier 1)
    // and a fuel item with mileage (tier 4). Correct combined order is
    // tier 1, then tier 2, then tier 4, then tier 6 - deliberately NOT
    // upload order and NOT a single chronological pass.
    const tier6 = makeItem({ description: "Tier6-fuel-no-mileage", category: "fuel", mileageOnReceipt: null, date: "2024-03-10" });
    const tier2 = makeItem({ description: "Tier2-service-no-mileage", category: "service", mileageOnReceipt: null, date: "2024-01-05" });
    const tier1 = makeItem({ description: "Tier1-service-with-mileage", category: "service", mileageOnReceipt: 5000, date: "2024-02-01" });
    const tier4 = makeItem({ description: "Tier4-fuel-with-mileage", category: "fuel", mileageOnReceipt: 5100, date: "2024-01-01" });

    const fetchMock = makeFetch({
      scanReceipt: (fileName) => {
        if (fileName === "file1.jpg") return { ok: true, json: async () => ({ items: [tier6, tier2] }) };
        return { ok: true, json: async () => ({ items: [tier1, tier4] }) };
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ScanReceiptButton isPro={true} />);
    await user.upload(fileInput(), [jpgFile("file1.jpg"), jpgFile("file2.jpg")]);

    await screen.findByText("✓ Read 2 receipts successfully.");

    const postBatchCall = fetchMock.mock.calls.find(
      (c) => c[0] === "/api/tracker/pending-scan-batch" && c[1]?.method === "POST"
    );
    expect(postBatchCall).toBeTruthy();
    const body = JSON.parse(postBatchCall![1]!.body as string);
    expect(body.items.map((i: { description: string }) => i.description)).toEqual([
      "Tier1-service-with-mileage",
      "Tier2-service-no-mileage",
      "Tier4-fuel-with-mileage",
      "Tier6-fuel-no-mileage",
    ]);

    // And the review queue itself opened with the full combined batch -
    // the first item (tier 1) is auto-commit-eligible, so it shows the
    // "logging automatically" progress screen rather than the manual
    // review form; 2 of these 4 items (tiers 1 and 4) are auto-commit
    // candidates in total.
    expect(await screen.findByText("Logging clear entries automatically")).toBeInTheDocument();
    expect(screen.getByText(/0 of 2 so far/)).toBeInTheDocument();
  });

  it("when every file yields zero items, the review queue never opens and nothing is persisted as a pending batch", async () => {
    const fetchMock = makeFetch({
      scanReceipt: () => ({ ok: true, json: async () => ({ items: [], summary: null }) }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ScanReceiptButton />);
    await user.upload(fileInput(), jpgFile("empty.jpg"));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => c[0] === "/api/tracker/scan-receipt")).toBe(true)
    );
    expect(
      fetchMock.mock.calls.some((c) => c[0] === "/api/tracker/pending-scan-batch" && c[1]?.method === "POST")
    ).toBe(false);
    expect(screen.queryByText(/Reviewing 1 of/)).not.toBeInTheDocument();
  });
});
