// Place at: tests/components/ScannedReceiptContext.test.tsx
//
// The second of the three shared dashboard contexts (see also
// TabSwitchContext.test.tsx). NavPendingBadge consumes this directly via
// useScannedReceipt(). Tested here: the Provider/hook pair, addItems'
// id-generation (each item gets its own unique id, not a shared one),
// removeItem, and goToNextPending's real behaviour of switching to
// whatever category is first in the queue.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ScannedReceiptProvider,
  useScannedReceipt,
  type ScannedReceiptItem,
} from "@/app/dashboard/ScannedReceiptContext";

function makeItem(overrides: Partial<Omit<ScannedReceiptItem, "id">> = {}): Omit<ScannedReceiptItem, "id"> {
  return {
    category: "fuel",
    date: "2026-01-01",
    cost: 42,
    description: "Fuel receipt",
    litres: 10,
    attachment: { blobName: "b1", fileName: "f1.jpg", fileType: "image/jpeg", uploadedAt: "2026-01-01" },
    ...overrides,
  };
}

describe("useScannedReceipt (no provider)", () => {
  it("falls back to an empty queue and safe no-ops instead of throwing", () => {
    function Consumer() {
      const { queue, addItems, removeItem, goToNextPending } = useScannedReceipt();
      return (
        <div>
          <span>queue:{queue.length}</span>
          <button onClick={() => addItems([makeItem()])}>add</button>
          <button onClick={() => removeItem("x")}>remove</button>
          <button onClick={() => goToNextPending()}>next</button>
        </div>
      );
    }
    render(<Consumer />);
    expect(screen.getByText("queue:0")).toBeInTheDocument();
    expect(() => screen.getByRole("button", { name: "add" }).click()).not.toThrow();
  });
});

describe("ScannedReceiptProvider", () => {
  function Consumer() {
    const { queue, addItems, removeItem, goToNextPending } = useScannedReceipt();
    return (
      <div>
        <span>queue:{queue.map((i) => i.id).join(",")}</span>
        <span>categories:{queue.map((i) => i.category).join(",")}</span>
        <button onClick={() => addItems([makeItem({ category: "fuel" }), makeItem({ category: "mods" })])}>
          add two
        </button>
        <button onClick={() => removeItem(queue[0]?.id)}>remove first</button>
        <button onClick={() => goToNextPending()}>next</button>
      </div>
    );
  }

  it("addItems assigns each item its own unique id", async () => {
    const user = userEvent.setup();
    render(
      <ScannedReceiptProvider onSwitchTab={vi.fn()}>
        <Consumer />
      </ScannedReceiptProvider>
    );
    await user.click(screen.getByRole("button", { name: "add two" }));

    const [id1, id2] = screen.getByText(/^queue:/).textContent!.replace("queue:", "").split(",");
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
    expect(screen.getByText("categories:fuel,mods")).toBeInTheDocument();
  });

  it("removeItem removes only the matching item, leaving the rest", async () => {
    const user = userEvent.setup();
    render(
      <ScannedReceiptProvider onSwitchTab={vi.fn()}>
        <Consumer />
      </ScannedReceiptProvider>
    );
    await user.click(screen.getByRole("button", { name: "add two" }));
    await user.click(screen.getByRole("button", { name: "remove first" }));

    expect(screen.getByText("categories:mods")).toBeInTheDocument();
  });

  it("goToNextPending switches to the first queued item's category", async () => {
    const onSwitchTab = vi.fn();
    const user = userEvent.setup();
    render(
      <ScannedReceiptProvider onSwitchTab={onSwitchTab}>
        <Consumer />
      </ScannedReceiptProvider>
    );
    await user.click(screen.getByRole("button", { name: "add two" }));
    await user.click(screen.getByRole("button", { name: "next" }));

    expect(onSwitchTab).toHaveBeenCalledWith("fuel");
  });

  it("goToNextPending does nothing when the queue is empty", async () => {
    const onSwitchTab = vi.fn();
    const user = userEvent.setup();
    render(
      <ScannedReceiptProvider onSwitchTab={onSwitchTab}>
        <Consumer />
      </ScannedReceiptProvider>
    );
    await user.click(screen.getByRole("button", { name: "next" }));
    expect(onSwitchTab).not.toHaveBeenCalled();
  });
});
