// Place at: tests/components/RecentActivity.test.tsx
//
// Recent-activity table. It's a real TabSwitchContext consumer (via the
// shared viewRecords helper) for click-to-view, so this renders it
// inside a real TabSwitchProvider - with a small sibling consumer to
// observe highlightIds - rather than mocking the context away.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecentActivity, type RecentActivityItem } from "@/app/dashboard/RecentActivity";
import { TabSwitchProvider, useTabSwitch } from "@/app/dashboard/TabSwitchContext";

function HighlightObserver() {
  const { highlightIds } = useTabSwitch();
  return <span>highlighted:{highlightIds.join(",")}</span>;
}

function renderWithProvider(items: RecentActivityItem[], onSwitchTab = vi.fn()) {
  return render(
    <TabSwitchProvider onSwitchTab={onSwitchTab}>
      <RecentActivity items={items} distanceUnit="mi" currency="GBP" rates={null} />
      <HighlightObserver />
    </TabSwitchProvider>
  );
}

const item: RecentActivityItem = {
  id: "rec-1",
  reviewCategory: "fuel",
  date: "2026-02-10",
  icon: "fuel",
  type: "Fuel",
  description: "Shell garage",
  category: "Petrol",
  cost: 45,
  mileage: 12000,
};

describe("RecentActivity", () => {
  it("shows an empty note when there is no activity yet", () => {
    renderWithProvider([]);
    expect(screen.getByText(/Nothing logged yet/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders a row with formatted date, cost, and mileage", () => {
    renderWithProvider([item]);
    expect(screen.getByText("10 Feb 2026")).toBeInTheDocument();
    expect(screen.getByText("Shell garage")).toBeInTheDocument();
    expect(screen.getByText("£45")).toBeInTheDocument();
    expect(screen.getByText("12,000")).toBeInTheDocument();
  });

  it("shows a dash for mileage when a row has none", () => {
    renderWithProvider([{ ...item, mileage: undefined }]);
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("clicking a row switches to that record's category and highlights just that id", async () => {
    const onSwitchTab = vi.fn();
    const user = userEvent.setup();
    renderWithProvider([item], onSwitchTab);

    await user.click(screen.getByText("Shell garage").closest("tr")!);

    expect(onSwitchTab).toHaveBeenCalledWith("fuel");
    expect(screen.getByText("highlighted:rec-1")).toBeInTheDocument();
  });
});
