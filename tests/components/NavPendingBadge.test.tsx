// Place at: tests/components/NavPendingBadge.test.tsx
//
// A real ScannedReceiptContext consumer - rendered inside a real
// ScannedReceiptProvider (see ScannedReceiptContext.test.tsx for the
// context's own direct tests) rather than mocking the hook away, so the
// "does this category have anything pending" check runs for real.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NavPendingBadge } from "@/app/dashboard/NavPendingBadge";
import { ScannedReceiptProvider, useScannedReceipt } from "@/app/dashboard/ScannedReceiptContext";

function Seeder() {
  const { addItems } = useScannedReceipt();
  return (
    <button
      onClick={() =>
        addItems([
          {
            category: "fuel",
            date: "2026-01-01",
            cost: 10,
            description: "x",
            litres: 5,
            attachment: { blobName: "b", fileName: "f", fileType: "image/jpeg", uploadedAt: "2026-01-01" },
          },
        ])
      }
    >
      seed fuel
    </button>
  );
}

describe("NavPendingBadge", () => {
  it("renders nothing when no queued item matches this category", () => {
    const { container } = render(
      <ScannedReceiptProvider onSwitchTab={vi.fn()}>
        <NavPendingBadge category="mods" />
      </ScannedReceiptProvider>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the badge once something is queued for this category, and not for a different one", async () => {
    const user = userEvent.setup();
    render(
      <ScannedReceiptProvider onSwitchTab={vi.fn()}>
        <Seeder />
        <NavPendingBadge category="fuel" />
        <NavPendingBadge category="mods" />
      </ScannedReceiptProvider>
    );

    await user.click(screen.getByRole("button", { name: "seed fuel" }));

    expect(screen.getAllByLabelText("A scanned item is waiting to be reviewed here")).toHaveLength(1);
  });
});
