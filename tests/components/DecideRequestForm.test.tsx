// Place at: tests/components/DecideRequestForm.test.tsx
//
// The approve/decline-per-item form a report recipient uses to decide
// on a receipt request. decideReceiptRequestItems (src/lib/tracker/receiptRequest.ts)
// already covers the real three-way approve/decline/revert-to-pending
// semantics at the lib level - this file tests the form's own UI logic:
// the preselectAll confirmation screen vs. the individual per-item
// review screen, the reason field that only appears for a decline, and
// what actually gets POSTed to /api/report/receipt-request/decide in
// each case. Only `fetch` is mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DecideRequestForm } from "@/app/report/receipt-request/decide/DecideRequestForm";
import type { ReceiptRequestItem } from "@/lib/tracker/receiptRequest";

function item(overrides: Partial<ReceiptRequestItem> & { entryId: string }): ReceiptRequestItem {
  return {
    category: "service",
    description: "Oil change",
    status: "pending",
    ...overrides,
  };
}

describe("DecideRequestForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("preselectAll confirmation screen", () => {
    it("lists every item and asks to confirm approving (or declining) all of them", () => {
      render(
        <DecideRequestForm
          token="tok1"
          items={[item({ entryId: "e1", description: "Oil change" }), item({ entryId: "e2", description: "Brake pads" })]}
          preselectAll="approve"
          buyerMessage="Would love to see these!"
        />
      );
      expect(screen.getByText(/about to/)).toHaveTextContent(/approve.*sharing 2 receipts/);
      expect(screen.getByText("Oil change")).toBeInTheDocument();
      expect(screen.getByText("Brake pads")).toBeInTheDocument();
      expect(screen.getByText(/Would love to see these!/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Confirm - approve all" })).toBeInTheDocument();
    });

    it("uses decline wording and the decline verb when preselectAll is 'decline'", () => {
      render(<DecideRequestForm token="tok1" items={[item({ entryId: "e1" })]} preselectAll="decline" />);
      expect(screen.getByRole("button", { name: "Confirm - decline all" })).toBeInTheDocument();
    });

    it("links to the individual-review page with the same token", () => {
      render(<DecideRequestForm token="tok1" items={[item({ entryId: "e1" })]} preselectAll="approve" />);
      expect(screen.getByRole("link", { name: "Review each one" })).toHaveAttribute(
        "href",
        "/report/receipt-request/decide?token=tok1"
      );
    });

    it("confirming sends decision:'approved', entryIds:'all' to the decide endpoint and shows the done message", async () => {
      const user = userEvent.setup();
      render(
        <DecideRequestForm
          token="tok1"
          items={[item({ entryId: "e1" }), item({ entryId: "e2" })]}
          preselectAll="approve"
        />
      );
      await user.click(screen.getByRole("button", { name: "Confirm - approve all" }));

      expect(fetch).toHaveBeenCalledWith(
        "/api/report/receipt-request/decide",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ token: "tok1", entryIds: "all", decision: "approved" }),
        })
      );
      expect(await screen.findByText(/Done - your decision has been saved/)).toBeInTheDocument();
    });

    it("confirming a decline-all sends decision:'declined'", async () => {
      const user = userEvent.setup();
      render(<DecideRequestForm token="tok1" items={[item({ entryId: "e1" })]} preselectAll="decline" />);
      await user.click(screen.getByRole("button", { name: "Confirm - decline all" }));

      expect(fetch).toHaveBeenCalledWith(
        "/api/report/receipt-request/decide",
        expect.objectContaining({
          body: JSON.stringify({ token: "tok1", entryIds: "all", decision: "declined" }),
        })
      );
    });

    it("shows a fixed error message when the confirm-all save comes back not-ok", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
      const user = userEvent.setup();
      render(<DecideRequestForm token="tok1" items={[item({ entryId: "e1" })]} preselectAll="approve" />);
      await user.click(screen.getByRole("button", { name: "Confirm - approve all" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Could not save your decision. Please try again.");
    });

    it("shows a connection error when fetch itself throws", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
      const user = userEvent.setup();
      render(<DecideRequestForm token="tok1" items={[item({ entryId: "e1" })]} preselectAll="approve" />);
      await user.click(screen.getByRole("button", { name: "Confirm - approve all" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server. Please try again.");
    });
  });

  describe("individual review screen (preselectAll: null)", () => {
    it("preselects each item's radio to its current status", () => {
      render(
        <DecideRequestForm
          token="tok1"
          items={[item({ entryId: "e1", status: "approved" }), item({ entryId: "e2", status: "declined" })]}
          preselectAll={null}
        />
      );
      const shareRadios = screen.getAllByRole("radio", { name: "Share" });
      const declineRadios = screen.getAllByRole("radio", { name: "Don't share" });
      expect(shareRadios[0]).toBeChecked();
      expect(declineRadios[1]).toBeChecked();
    });

    it("shows a reason input only once an item is switched to 'Don't share'", async () => {
      const user = userEvent.setup();
      render(<DecideRequestForm token="tok1" items={[item({ entryId: "e1", status: "pending" })]} preselectAll={null} />);

      expect(screen.queryByPlaceholderText(/Reason \(optional\)/)).not.toBeInTheDocument();
      await user.click(screen.getByRole("radio", { name: "Don't share" }));
      expect(screen.getByPlaceholderText(/Reason \(optional\)/)).toBeInTheDocument();
    });

    it("save posts approved entries together and declined entries one at a time with their own reason", async () => {
      const fetchMock = fetch as ReturnType<typeof vi.fn>;
      const user = userEvent.setup();
      render(
        <DecideRequestForm
          token="tok1"
          items={[item({ entryId: "e1", status: "pending" }), item({ entryId: "e2", status: "pending" })]}
          preselectAll={null}
        />
      );
      const shareRadios = screen.getAllByRole("radio", { name: "Share" });
      const declineRadios = screen.getAllByRole("radio", { name: "Don't share" });
      await user.click(shareRadios[0]); // e1 -> approved
      await user.click(declineRadios[1]); // e2 -> declined
      await user.type(screen.getByPlaceholderText(/Reason \(optional\)/), "No paperwork kept");
      await user.click(screen.getByRole("button", { name: "Save decisions" }));

      const bodies = fetchMock.mock.calls.map(([, opts]) => JSON.parse((opts as { body: string }).body));
      expect(bodies).toContainEqual({ token: "tok1", entryIds: ["e1"], decision: "approved" });
      expect(bodies).toContainEqual({ token: "tok1", entryIds: ["e2"], decision: "declined", reason: "No paperwork kept" });
      expect(await screen.findByText(/Done - your decision has been saved/)).toBeInTheDocument();
    });

    it("shows the buyer's message above the item list when present", () => {
      render(
        <DecideRequestForm
          token="tok1"
          items={[item({ entryId: "e1" })]}
          preselectAll={null}
          buyerMessage="Bought the bike last week, would appreciate these."
        />
      );
      expect(screen.getByText(/Bought the bike last week, would appreciate these\./)).toBeInTheDocument();
    });

    it("BUG: individual save never checks the decide endpoint's response status - a not-ok response is still treated as done", async () => {
      // Unlike submitAll (used by the preselectAll confirmation screen,
      // which does check res.ok), handleIndividualSubmit's try block
      // calls setDone(true) unconditionally after its fetches resolve,
      // regardless of whether the server actually accepted the decision.
      // Only a thrown fetch (network failure) is treated as a failure.
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
      const user = userEvent.setup();
      render(<DecideRequestForm token="tok1" items={[item({ entryId: "e1", status: "pending" })]} preselectAll={null} />);
      await user.click(screen.getByRole("radio", { name: "Share" }));
      await user.click(screen.getByRole("button", { name: "Save decisions" }));

      expect(await screen.findByText(/Done - your decision has been saved/)).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("shows a connection error, not the done message, when fetch itself throws", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
      const user = userEvent.setup();
      render(<DecideRequestForm token="tok1" items={[item({ entryId: "e1", status: "pending" })]} preselectAll={null} />);
      await user.click(screen.getByRole("radio", { name: "Share" }));
      await user.click(screen.getByRole("button", { name: "Save decisions" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server. Please try again.");
      expect(screen.queryByText(/Done - your decision has been saved/)).not.toBeInTheDocument();
    });
  });

  describe("ItemPreview", () => {
    it("shows a titled 'No preview' tag when the item has no attachment", () => {
      render(<DecideRequestForm token="tok1" items={[item({ entryId: "e1" })]} preselectAll={null} />);
      expect(screen.getByTitle("This request was made before previews were added")).toHaveTextContent("No preview");
    });

    it("links to the receipt-request attachment endpoint for an item that has one", () => {
      render(
        <DecideRequestForm
          token="tok1"
          items={[
            item({
              entryId: "e1",
              attachment: { blobName: "blob 1", fileName: "receipt.pdf", fileType: "application/pdf", uploadedAt: "2024-01-01T00:00:00Z" },
            }),
          ]}
          preselectAll={null}
        />
      );
      expect(screen.getByRole("link", { name: /View receipt/ })).toHaveAttribute(
        "href",
        "/api/report/receipt-request/attachment/tok1/blob%201"
      );
    });
  });
});
