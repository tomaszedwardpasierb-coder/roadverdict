// Place at: tests/components/MileageConflictModal.test.tsx
//
// MileageConflictModal resolves a mileage-vs-date conflict between two
// tracker records (or one record and a still-unsaved batch peer). Only
// fetch is mocked - the real re-check against pointsConflict (imported for
// real from mileageCheck.ts, not stubbed) and every button's real
// PATCH/DELETE body construction run for real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MileageConflictModal } from "@/app/dashboard/MileageConflictModal";

function jsonOk(data: unknown) {
  return { ok: true, json: async () => data };
}
function jsonErr(data: unknown) {
  return { ok: false, json: async () => data };
}

const onResolved = vi.fn();
const onClose = vi.fn();
const buildPatchBody = vi.fn(
  (overrides: { mileage?: number; date?: string; mileageAnomaly?: boolean; mileageAcknowledged?: boolean }) => ({
    jobType: "full-service",
    cost: 120,
    mileage: overrides.mileage ?? 5000,
    date: overrides.date ?? "2025-02-01",
    notes: "",
    mileageAcknowledged: overrides.mileageAcknowledged,
    ...(overrides.mileageAnomaly !== undefined ? { mileageAnomaly: overrides.mileageAnomaly } : {}),
  })
);

const baseProps = {
  entryId: "entry-1",
  entryCategory: "service" as const,
  entryDate: "2025-02-01",
  entryMileage: 5000,
  entryLabel: "Full service",
  buildPatchBody,
  onResolved,
  onClose,
};

// A reference entry dated earlier than the entry above, with a HIGHER
// mileage - a genuine chronology conflict (mileage should never go down
// as dates go forward).
const conflictingReference = {
  id: "ref-1",
  category: "fuel" as const,
  date: "2025-01-01",
  mileage: 6000,
  label: "Fuel fill-up",
  cost: 18.5,
  attachment: null,
  litres: 12.3,
  filledToFull: true,
};

// A reference entry that's consistent with the entry above (mileage rises
// with the date) - used to exercise the "no conflict after all" branch.
const consistentReference = {
  id: "ref-2",
  category: "fuel" as const,
  date: "2025-01-01",
  mileage: 4000,
  label: "Fuel fill-up",
  cost: 15,
  attachment: null,
  litres: 10,
  filledToFull: true,
};

function renderModal(overrides: Record<string, unknown> = {}) {
  return render(<MileageConflictModal {...baseProps} {...overrides} />);
}

describe("MileageConflictModal", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    buildPatchBody.mockClear();
    onResolved.mockClear();
    onClose.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a specific error, not a permanent spinner, when there is no reference at all to compare against", async () => {
    renderModal();
    expect(await screen.findByRole("alert")).toHaveTextContent("No reference entry to compare against.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("loads the real reference entry over the network and shows both sides with correct EARLIER/LATER labels", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonOk(conflictingReference));
    renderModal({ referenceId: "ref-1", referenceCategory: "fuel" });

    expect(fetch).toHaveBeenCalledWith("/api/tracker/conflict-reference?category=fuel&id=ref-1");
    expect(await screen.findByText("Mileage conflict")).toBeInTheDocument();
    // Entry is dated 2025-02-01 (later); reference is dated 2025-01-01 (earlier).
    expect(screen.getByText("LATER · This entry")).toBeInTheDocument();
    expect(screen.getByText("EARLIER · Fuel")).toBeInTheDocument();
    expect(screen.getByText("5,000 mi")).toBeInTheDocument();
    expect(screen.getByText("6,000 mi")).toBeInTheDocument();
  });

  it("uses a pre-loaded batch-peer reference with no network fetch at all", async () => {
    renderModal({ preloadedReference: { ...conflictingReference }, isBatchPeerReference: true });
    expect(await screen.findByText("Mileage conflict")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the server's own error, not a generic one, when the reference fetch responds not-ok", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonErr({ error: "That entry no longer exists." }));
    renderModal({ referenceId: "ref-1", referenceCategory: "fuel" });
    expect(await screen.findByRole("alert")).toHaveTextContent("That entry no longer exists.");
  });

  it("shows a connection error, not an unhandled rejection, when the reference fetch itself throws", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network down"));
    renderModal({ referenceId: "ref-1", referenceCategory: "fuel" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
  });

  it("when the numbers no longer actually conflict, offers only to clear the stale warning - which re-saves the entry unchanged", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonOk(consistentReference)).mockResolvedValueOnce(jsonOk({}));
    const user = userEvent.setup();
    renderModal({ referenceId: "ref-2", referenceCategory: "fuel" });

    expect(await screen.findByText("No conflict found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Keep both/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear this warning" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenLastCalledWith(
        "/api/tracker/services/entry-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify(buildPatchBody({ mileageAcknowledged: true })),
        })
      )
    );
    expect(onResolved).toHaveBeenCalled();
  });

  it("'Keep both as they are' marks the entry as a known anomaly via a real PATCH, then resolves", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonOk(conflictingReference)).mockResolvedValueOnce(jsonOk({}));
    const user = userEvent.setup();
    renderModal({ referenceId: "ref-1", referenceCategory: "fuel" });
    await screen.findByText("Mileage conflict");

    await user.click(screen.getByRole("button", { name: /Keep both as they are/ }));

    await waitFor(() =>
      expect(fetch).toHaveBeenLastCalledWith(
        "/api/tracker/services/entry-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify(buildPatchBody({ mileageAcknowledged: true, mileageAnomaly: true })),
        })
      )
    );
    expect(onResolved).toHaveBeenCalled();
  });

  it("shows a generic save error and never resolves when the PATCH itself fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonOk(conflictingReference)).mockResolvedValueOnce(jsonErr({}));
    const user = userEvent.setup();
    renderModal({ referenceId: "ref-1", referenceCategory: "fuel" });
    await screen.findByText("Mileage conflict");

    await user.click(screen.getByRole("button", { name: /Keep both as they are/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save. Try again.");
    expect(onResolved).not.toHaveBeenCalled();
  });

  it("'Correct the mileage' mode pre-fills both sides' real values, and saving sends a PATCH only for the side that actually changed", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonOk(conflictingReference)).mockResolvedValueOnce(jsonOk({}));
    const user = userEvent.setup();
    renderModal({ referenceId: "ref-1", referenceCategory: "fuel" });
    await screen.findByText("Mileage conflict");

    await user.click(screen.getByRole("button", { name: "Correct the mileage on one or both entries" }));
    expect(screen.getByLabelText("This entry's mileage")).toHaveValue(5000);
    expect(screen.getByLabelText("This entry's date")).toHaveValue("2025-02-01");
    expect(screen.getByLabelText("Fuel's mileage")).toHaveValue(6000);
    expect(screen.getByLabelText("Fuel's date")).toHaveValue("2025-01-01");

    // Only change the reference's mileage - the entry's own values are left alone.
    const refMileageInput = screen.getByLabelText("Fuel's mileage");
    await user.clear(refMileageInput);
    await user.type(refMileageInput, "6500");
    await user.click(screen.getByRole("button", { name: "Save both" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenLastCalledWith(
        "/api/tracker/fuel/ref-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ litres: 12.3, cost: 18.5, mileage: 6500, date: "2025-01-01", filledToFull: true, mileageAcknowledged: true }),
        })
      )
    );
    // The entry itself never changed, so it should never have been PATCHed.
    expect(fetch).not.toHaveBeenCalledWith("/api/tracker/services/entry-1", expect.anything());
    expect(onResolved).toHaveBeenCalled();
  });

  it("correcting a still-unsaved batch-peer reference goes through the callback, never a network PATCH", async () => {
    const onCorrectBatchPeer = vi.fn();
    const user = userEvent.setup();
    renderModal({
      preloadedReference: { ...conflictingReference },
      isBatchPeerReference: true,
      onCorrectBatchPeer,
    });
    await screen.findByText("Mileage conflict");

    await user.click(screen.getByRole("button", { name: "Correct the mileage on one or both entries" }));
    const refMileageInput = screen.getByLabelText("Fuel's mileage");
    await user.clear(refMileageInput);
    await user.type(refMileageInput, "6500");
    await user.click(screen.getByRole("button", { name: "Save both" }));

    await waitFor(() => expect(onCorrectBatchPeer).toHaveBeenCalledWith(6500, "2025-01-01"));
    expect(fetch).not.toHaveBeenCalled();
    expect(onResolved).toHaveBeenCalled();
  });

  it("'Delete this entry' deletes only the entry's own record", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonOk(conflictingReference)).mockResolvedValueOnce(jsonOk({}));
    const user = userEvent.setup();
    renderModal({ referenceId: "ref-1", referenceCategory: "fuel" });
    await screen.findByText("Mileage conflict");

    await user.click(screen.getByRole("button", { name: "Delete this entry (Full service)" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenLastCalledWith("/api/tracker/services/entry-1", expect.objectContaining({ method: "DELETE" }))
    );
    expect(onResolved).toHaveBeenCalled();
  });

  it("'Delete both entries' deletes both the entry and the reference", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonOk(conflictingReference))
      .mockResolvedValueOnce(jsonOk({}))
      .mockResolvedValueOnce(jsonOk({}));
    const user = userEvent.setup();
    renderModal({ referenceId: "ref-1", referenceCategory: "fuel" });
    await screen.findByText("Mileage conflict");

    await user.click(screen.getByRole("button", { name: "Delete both entries" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/tracker/services/entry-1", expect.objectContaining({ method: "DELETE" }))
    );
    expect(fetch).toHaveBeenCalledWith("/api/tracker/fuel/ref-1", expect.objectContaining({ method: "DELETE" }));
    expect(onResolved).toHaveBeenCalled();
  });

  it("deleting a still-unsaved batch-peer reference goes through the callback, never a network DELETE", async () => {
    const onDeleteBatchPeer = vi.fn();
    const user = userEvent.setup();
    renderModal({
      preloadedReference: { ...conflictingReference },
      isBatchPeerReference: true,
      onDeleteBatchPeer,
    });
    await screen.findByText("Mileage conflict");

    await user.click(screen.getByRole("button", { name: "Delete the other entry (Fuel fill-up)" }));

    await waitFor(() => expect(onDeleteBatchPeer).toHaveBeenCalled());
    expect(fetch).not.toHaveBeenCalled();
    expect(onResolved).toHaveBeenCalled();
  });

  it("Cancel closes the modal without touching the network at all", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonOk(conflictingReference));
    const user = userEvent.setup();
    renderModal({ referenceId: "ref-1", referenceCategory: "fuel" });
    await screen.findByText("Mileage conflict");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1); // only the initial reference load
  });
});
