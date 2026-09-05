// Place at: tests/components/DashboardShell.test.tsx
//
// DashboardShell is the top-level client shell: it owns the active-tab
// state, renders every nav item (desktop sidebar + mobile bottom bar +
// "More" sheet) with their real pending/ready/incoming-request dots, and
// is the ONE place that actually supplies a real TabSwitchProvider (see
// TabSwitchContext.tsx - its useTabSwitch() hook has a safe no-provider
// fallback, but that fallback's switchTo/setFocusId are no-ops; the
// point of the test below is to prove DashboardShell wires the REAL
// thing through to setActive, not that fallback). Only next/navigation's
// useRouter is mocked - it's pulled in transitively by several of
// DashboardShell's real child buttons (BikeSwitcher, UpdateMileageButton,
// RefreshVehicleDataButton, LogoutButton, ResetDemoButton).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { DashboardShell } from "@/app/dashboard/DashboardShell";
import { useTabSwitch } from "@/app/dashboard/TabSwitchContext";
import { ActiveSectionProvider, useActiveSection } from "@/components/ActiveSectionContext";
import { DEMO_EMAIL } from "@/lib/tracker/demoSeed";

const emptyPendingIds = { service: [], fuel: [], mods: [], bills: [] };

function baseProps(overrides: Partial<Parameters<typeof DashboardShell>[0]> = {}) {
  return {
    bikeName: "Trusty Steed",
    bikeYear: 2020,
    currentMileage: 15000,
    distanceUnit: "mi" as const,
    userEmail: "rider@example.com",
    isPro: false,
    bikes: [{ id: "bike-1", name: "Trusty Steed", year: 2020, currentMileage: 15000 }],
    activeBikeId: "bike-1",
    pendingReviewIds: emptyPendingIds,
    hasPendingReceiptRequests: false,
    dashboardContent: <div>Dashboard content</div>,
    serviceContent: <div>Service content</div>,
    fuelContent: <div>Fuel content</div>,
    modsContent: <div>Mods content</div>,
    billsContent: <div>Bills content</div>,
    remindersContent: <div>Reminders content</div>,
    reportsContent: <div>Reports content</div>,
    storyContent: <div>Story content</div>,
    shareLinksContent: <div>ShareLinks content</div>,
    quoteCheckerContent: <div>QuoteChecker content</div>,
    costCalculatorContent: <div>CostCalculator content</div>,
    buyingGuideContent: <div>BuyingGuide content</div>,
    privacyContent: <div>Privacy content</div>,
    transferOwnershipContent: <div>TransferOwnership content</div>,
    securityContent: <div>Security content</div>,
    storyReady: false,
    hasIncomingRequest: false,
    ...overrides,
  };
}

describe("DashboardShell", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows only the Dashboard tab's own content by default", () => {
    render(<DashboardShell {...baseProps()} />);
    expect(screen.getByText("Dashboard content")).toBeInTheDocument();
    expect(screen.queryByText("Service content")).not.toBeInTheDocument();
    expect(screen.queryByText("Story content")).not.toBeInTheDocument();
  });

  it("clicking a sidebar nav item switches the visible content to that tab's own real content", async () => {
    const user = userEvent.setup();
    render(<DashboardShell {...baseProps()} />);
    await user.click(screen.getAllByRole("button", { name: "Fuel" })[0]);

    expect(screen.getByText("Fuel content")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard content")).not.toBeInTheDocument();
  });

  it("a real child inside the tab content can switch tabs itself via the REAL TabSwitchProvider (not its no-op fallback)", async () => {
    function SwitchToFuelButton() {
      const { switchTo } = useTabSwitch();
      return (
        <button type="button" onClick={() => switchTo("fuel")}>
          Jump to fuel from inside the tab
        </button>
      );
    }

    const user = userEvent.setup();
    render(<DashboardShell {...baseProps({ dashboardContent: <SwitchToFuelButton /> })} />);
    await user.click(screen.getByRole("button", { name: "Jump to fuel from inside the tab" }));

    expect(screen.getByText("Fuel content")).toBeInTheDocument();
  });

  it("shows a review-pending dot next to a nav item whose category has pending ids, and none when it doesn't", () => {
    const { rerender } = render(
      <DashboardShell {...baseProps({ pendingReviewIds: { ...emptyPendingIds, mods: ["mod-1"] } })} />
    );
    expect(screen.getAllByLabelText("An entry here needs review").length).toBeGreaterThan(0);

    rerender(<DashboardShell {...baseProps()} />);
    expect(screen.queryByLabelText("An entry here needs review")).not.toBeInTheDocument();
  });

  it("shows the same pending dot next to Shareable Links when there's an incoming receipt request", () => {
    render(<DashboardShell {...baseProps({ hasPendingReceiptRequests: true })} />);
    const shareLinksButton = screen.getByRole("button", { name: /Shareable Links/ });
    expect(shareLinksButton.querySelector('[aria-label="An entry here needs review"]')).not.toBeNull();
  });

  it("shows the ready dot next to Story only when storyReady is true", () => {
    const { rerender } = render(<DashboardShell {...baseProps({ storyReady: true })} />);
    expect(screen.getAllByLabelText("Enough logged history for a worthwhile story").length).toBeGreaterThan(0);

    rerender(<DashboardShell {...baseProps({ storyReady: false })} />);
    expect(screen.queryByLabelText("Enough logged history for a worthwhile story")).not.toBeInTheDocument();
  });

  it("shows the request dot next to Transfer ownership only when hasIncomingRequest is true", () => {
    render(<DashboardShell {...baseProps({ hasIncomingRequest: true })} />);
    expect(screen.getByLabelText("Someone is requesting this bike's history")).toBeInTheDocument();
  });

  // This is the other side of ActiveSectionContext.tsx's own reasoning:
  // the globally-mounted AssistantWidget lives outside DashboardShell's
  // own tree entirely, so it can only learn which tab is open if
  // DashboardShell actually publishes it to the shared context - not
  // just tracks it in its own local `active` state.
  it("publishes the active tab to the shared ActiveSectionContext so the assistant widget (mounted elsewhere) can read it", async () => {
    function ShowActiveSection() {
      const { activeSection } = useActiveSection();
      return <div>Active section: {activeSection ?? "none"}</div>;
    }

    const user = userEvent.setup();
    render(
      <ActiveSectionProvider>
        <DashboardShell {...baseProps()} />
        <ShowActiveSection />
      </ActiveSectionProvider>
    );

    expect(screen.getByText("Active section: dashboard")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Fuel" })[0]);
    expect(screen.getByText("Active section: fuel")).toBeInTheDocument();
  });

  it("shows a Premium badge next to the user's email only when isPro is true", () => {
    const { rerender } = render(<DashboardShell {...baseProps({ isPro: false })} />);
    expect(screen.queryByText("Premium")).not.toBeInTheDocument();

    rerender(<DashboardShell {...baseProps({ isPro: true })} />);
    expect(screen.getByText("Premium")).toBeInTheDocument();
  });

  it("shows days remaining alongside Premium only when both isPro and a real count are given", () => {
    const { rerender } = render(<DashboardShell {...baseProps({ isPro: true, proDaysRemaining: 23 })} />);
    expect(screen.getByText("23 days left")).toBeInTheDocument();

    rerender(<DashboardShell {...baseProps({ isPro: true, proDaysRemaining: 1 })} />);
    expect(screen.getByText("1 day left")).toBeInTheDocument();

    rerender(<DashboardShell {...baseProps({ isPro: true, proDaysRemaining: null })} />);
    expect(screen.queryByText(/day.* left/)).not.toBeInTheDocument();

    rerender(<DashboardShell {...baseProps({ isPro: false, proDaysRemaining: 23 })} />);
    expect(screen.queryByText(/day.* left/)).not.toBeInTheDocument();
  });

  it("shows the Reset Demo button only for the real demo account email", () => {
    const { rerender } = render(<DashboardShell {...baseProps({ userEmail: DEMO_EMAIL })} />);
    expect(screen.getAllByRole("button", { name: "↺ Reset Demo" }).length).toBeGreaterThan(0);

    rerender(<DashboardShell {...baseProps({ userEmail: "someone-else@example.com" })} />);
    expect(screen.queryByRole("button", { name: "↺ Reset Demo" })).not.toBeInTheDocument();
  });

  it("opening the mobile More sheet reveals its own items, and picking one switches tabs and closes the sheet", async () => {
    const user = userEvent.setup();
    render(<DashboardShell {...baseProps()} />);
    expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /More/ }));
    expect(screen.getByText(/Signed in as rider@example\.com/)).toBeInTheDocument();

    // "Insurance, Tax, MOT & Finance" also appears in the always-mounted sidebar nav -
    // the sheet's own copy (rendered later in the DOM) is the last match.
    const taxAndInsuranceButtons = screen.getAllByRole("button", { name: /Insurance, Tax, MOT & Finance/ });
    await user.click(taxAndInsuranceButtons[taxAndInsuranceButtons.length - 1]);
    expect(screen.getByText("Bills content")).toBeInTheDocument();
    expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument();
  });

  it("renders the real BikeSwitcher child for a single-bike account, not a stub", () => {
    render(<DashboardShell {...baseProps()} />);
    expect(screen.getByText("My bike")).toBeInTheDocument();
    expect(screen.getAllByText("Trusty Steed").length).toBeGreaterThan(0);
  });

  it("renders the real bike year and formatted mileage (shown in both the sidebar card and the mobile top bar)", () => {
    render(<DashboardShell {...baseProps()} />);
    expect(screen.getAllByText("2020 · 15,000 miles").length).toBe(2);
  });

  it("shows the disclaimer footer at the bottom of the active tab's own scrollable content", () => {
    render(<DashboardShell {...baseProps()} />);
    expect(
      screen.getByText(/RoadVerdict is guidance benchmarked against typical prices, not a professional inspection\./)
    ).toBeInTheDocument();
  });

  it("also shows the disclaimer footer inside the mobile More sheet", async () => {
    const user = userEvent.setup();
    render(<DashboardShell {...baseProps()} />);
    await user.click(screen.getByRole("button", { name: /More/ }));

    expect(
      screen.getAllByText(/RoadVerdict is guidance benchmarked against typical prices, not a professional inspection\./).length
    ).toBeGreaterThan(1);
  });
});
