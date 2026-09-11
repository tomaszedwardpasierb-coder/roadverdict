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
// DashboardShell's real child buttons (VehicleSwitcher, UpdateMileageButton,
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

const emptyPendingIds = { service: [], fuel: [], mods: [], bills: [], labour: [] };

function baseProps(overrides: Partial<Parameters<typeof DashboardShell>[0]> = {}) {
  return {
    vehicleKind: "bike" as const,
    vehicleName: "Trusty Steed",
    vehicleYear: 2020,
    currentMileage: 15000,
    distanceUnit: "mi" as const,
    userEmail: "rider@example.com",
    isPro: false,
    vehicles: [{ id: "bike-1", kind: "bike" as const, name: "Trusty Steed", year: 2020, currentMileage: 15000 }],
    activeVehicleId: "bike-1",
    refreshAvailable: true,
    nextRefreshAvailableAt: null,
    pendingReviewIds: emptyPendingIds,
    hasPendingReceiptRequests: false,
    dashboardContent: <div>Dashboard content</div>,
    serviceContent: <div>Service content</div>,
    fuelContent: <div>Fuel content</div>,
    modsContent: <div>Mods content</div>,
    labourContent: <div>Labour content</div>,
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

  // A buyer returning from Stripe checkout after buying the Buying
  // Guide's vehicle-history report from inside the dashboard should land
  // back on that same tab, not the default Dashboard overview - see
  // dashboard/page.tsx's own `tab` query param and
  // buyingGuideVdiCheckout.ts's BuyingGuideReturnContext.
  it("reopens the Buying Guide tab on load when initialSection is set, instead of the default Dashboard tab", () => {
    render(<DashboardShell {...baseProps({ initialSection: "buyingGuide" })} />);
    expect(screen.getByText("BuyingGuide content")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard content")).not.toBeInTheDocument();
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

  it("shows the same pending dot next to Shareable Links when there's an incoming receipt request", async () => {
    const user = userEvent.setup();
    render(<DashboardShell {...baseProps({ hasPendingReceiptRequests: true })} />);
    // Shareable Links lives inside the Selling group, collapsed by default -
    // its own header should already show the rolled-up signal even before
    // expanding. "Selling" also has its own mobile-bottom-bar icon (always
    // mounted, just CSS-hidden by media query) - the sidebar's own copy is
    // the first match.
    const sellingHeader = screen.getAllByRole("button", { name: /Selling/ })[0];
    expect(sellingHeader.querySelector('[aria-label="An entry here needs review"]')).not.toBeNull();

    await user.click(sellingHeader);
    const shareLinksButton = screen.getByRole("button", { name: /Shareable Links/ });
    expect(shareLinksButton.querySelector('[aria-label="An entry here needs review"]')).not.toBeNull();
  });

  it("shows the ready dot next to Story only when storyReady is true", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DashboardShell {...baseProps({ storyReady: true })} />);
    // The Story item lives inside the Insights group, collapsed by default.
    await user.click(screen.getAllByRole("button", { name: /Insights/ })[0]);
    expect(screen.getAllByLabelText("Enough logged history for a worthwhile story").length).toBeGreaterThan(0);

    rerender(<DashboardShell {...baseProps({ storyReady: false })} />);
    expect(screen.queryByLabelText("Enough logged history for a worthwhile story")).not.toBeInTheDocument();
  });

  it("shows the request dot next to Transfer ownership only when hasIncomingRequest is true", async () => {
    const user = userEvent.setup();
    render(<DashboardShell {...baseProps({ hasIncomingRequest: true })} />);
    // Transfer ownership lives inside the Selling group, collapsed by
    // default - its own header should already show the rolled-up signal
    // even before expanding.
    const sellingHeader = screen.getAllByRole("button", { name: /Selling/ })[0];
    expect(sellingHeader.querySelector('[aria-label="An entry here needs review"]')).not.toBeNull();

    await user.click(sellingHeader);
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

    // "Reminders" also appears in the always-mounted sidebar nav -
    // the sheet's own copy (rendered later in the DOM) is the last match.
    const remindersButtons = screen.getAllByRole("button", { name: /Reminders/ });
    await user.click(remindersButtons[remindersButtons.length - 1]);
    expect(screen.getByText("Reminders content")).toBeInTheDocument();
    expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument();
  });

  it("opening a bottom-bar group's own shelf (Logbook) shows just its items, not Reminders/Security/Privacy alongside them", async () => {
    const user = userEvent.setup();
    render(<DashboardShell {...baseProps()} />);

    // The bottom-bar "Logbook" icon - distinct from the sidebar's own
    // Logbook header (which is a different button, already expanded).
    const logbookBarButtons = screen.getAllByRole("button", { name: /Logbook/ });
    await user.click(logbookBarButtons[logbookBarButtons.length - 1]);

    // The More sheet's own footer content never renders for a group
    // shelf - proof this is the scoped Logbook shelf, not the full More
    // sheet Logbook's items used to sit inside.
    expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument();

    const billsButtons = screen.getAllByRole("button", { name: /Insurance, Tax, MOT & Finance/ });
    await user.click(billsButtons[billsButtons.length - 1]);
    expect(screen.getByText("Bills content")).toBeInTheDocument();
  });

  it("renders the real VehicleSwitcher child for a single-bike account, not a stub", () => {
    render(<DashboardShell {...baseProps()} />);
    expect(screen.getByText("My bike")).toBeInTheDocument();
    expect(screen.getAllByText("Trusty Steed").length).toBeGreaterThan(0);
  });

  it("renders the real vehicle year and formatted mileage (shown in both the sidebar card and the mobile top bar)", () => {
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

  // Sidebar/mobile-sheet nav items are grouped into collapsible categories
  // (Logbook/Insights/Selling/Buying Tools) rather than one flat 15-item
  // list - Logbook defaults open (daily-use tabs), the other three default
  // closed (the long-tail tabs that were causing the actual clutter).
  it("shows the bike-flavoured 'Buying a used bike' label for a bike-active session", async () => {
    const user = userEvent.setup();
    render(<DashboardShell {...baseProps()} />);
    const buyingToolsHeader = screen.getAllByRole("button", { name: /Buying Tools/ })[0];
    await user.click(buyingToolsHeader);
    expect(screen.getByRole("button", { name: "Buying a used bike" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Buying a used car" })).not.toBeInTheDocument();
  });

  describe("collapsible nav groups", () => {
    it("Logbook's own items are visible with no interaction; the other three groups' items are not", () => {
      render(<DashboardShell {...baseProps()} />);
      expect(screen.getByRole("button", { name: "Fuel" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Labour" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reports" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Shareable Links" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Quote Checker" })).not.toBeInTheDocument();
    });

    // The mobile bottom bar itself shows group-level icons (Dashboard,
    // Logbook, Insights, Selling, More) rather than individual tabs
    // (Service/Fuel/Parts used to have their own icons here) - Logbook's
    // own items are only ever reached via its shelf now, never as
    // separate bottom-bar buttons.
    it("the mobile bottom bar shows group icons, not individual Service/Fuel/Parts icons", () => {
      render(<DashboardShell {...baseProps()} />);
      const bottomNav = document.querySelector('[data-mobile-bottom-nav]') as HTMLElement;
      const bottomBarButtonNames = Array.from(bottomNav.querySelectorAll('button')).map((b) => b.textContent);
      expect(bottomBarButtonNames).toEqual(['Dashboard', 'Logbook', 'Insights', 'Selling', '⋯More']);
    });

    it("clicking a group header toggles its items open and closed, and flips aria-expanded", async () => {
      const user = userEvent.setup();
      render(<DashboardShell {...baseProps()} />);
      const insightsHeader = screen.getAllByRole("button", { name: /Insights/ })[0];
      expect(insightsHeader).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("button", { name: "Reports" })).not.toBeInTheDocument();

      await user.click(insightsHeader);
      expect(insightsHeader).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("button", { name: "Reports" })).toBeInTheDocument();

      await user.click(insightsHeader);
      expect(insightsHeader).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("button", { name: "Reports" })).not.toBeInTheDocument();
    });

    it("a group stays expanded even if its own header is clicked to collapse it, as long as its item is the active tab", async () => {
      const user = userEvent.setup();
      render(<DashboardShell {...baseProps()} />);
      const insightsHeader = screen.getAllByRole("button", { name: /Insights/ })[0];
      await user.click(insightsHeader);
      await user.click(screen.getByRole("button", { name: "Reports" }));
      expect(screen.getByText("Reports content")).toBeInTheDocument();

      await user.click(insightsHeader);
      // Still expanded - Reports is the active tab, so its own group
      // can't be collapsed out from under it.
      expect(screen.getByRole("button", { name: "Reports" })).toBeInTheDocument();
    });
  });

  // The hybrid dashboard's own guard used to hide Story/Shareable
  // Links/Transfer ownership while a car was the active vehicle, one at
  // a time, as each grew a real car equivalent. All three now have one,
  // so CAR_UNAVAILABLE_SECTIONS is genuinely empty today - kept as a
  // real (if currently empty) list in DashboardShell.tsx rather than
  // removed outright, so a future feature that genuinely doesn't have a
  // car equivalent yet has somewhere to go.
  describe("vehicleKind: car", () => {
    function carProps(overrides: Partial<Parameters<typeof DashboardShell>[0]> = {}) {
      return baseProps({
        vehicleKind: "car",
        vehicleName: "Focus",
        vehicles: [{ id: "car-1", kind: "car", name: "Focus", year: 2020, currentMileage: 40000 }],
        activeVehicleId: "car-1",
        ...overrides,
      });
    }

    // CAR_UNAVAILABLE_SECTIONS (DashboardShell.tsx) is empty today.
    // Reports, the three buying tools (Quote Checker/Cost calculator/Buying
    // a used bike), Shareable Links, Story, and Transfer ownership all came
    // off this list once their own car equivalents were built (see
    // reportsContent/quoteCheckerContent/costCalculatorContent/
    // buyingGuideContent/shareLinksContent/storyContent/
    // transferOwnershipContent in dashboard/page.tsx's renderCarDashboard) -
    // kept as an empty list here as a comment, not silently dropped, so a
    // future reader can see they were deliberately removed rather than
    // forgotten.
    const CAR_UNAVAILABLE_LABELS: string[] = [];

    it("hides every CAR_UNAVAILABLE_SECTIONS label from the sidebar nav (currently a no-op - the list is empty)", () => {
      render(<DashboardShell {...carProps()} />);
      for (const label of CAR_UNAVAILABLE_LABELS) {
        expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
      }
      // Every other tab is still present.
      expect(screen.getAllByRole("button", { name: "Fuel" }).length).toBeGreaterThan(0);
    });

    // Reports has a real car equivalent now - it must actually render as
    // a clickable nav item for a car-active session, not just be absent
    // from the unavailable-labels list above.
    it("still shows Reports as a real, clickable nav item for a car-active session", async () => {
      const user = userEvent.setup();
      render(<DashboardShell {...carProps()} />);
      const insightsHeader = screen.getAllByRole("button", { name: /Insights/ })[0];
      await user.click(insightsHeader);

      expect(screen.getByRole("button", { name: "Reports" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Reports" }));
      expect(screen.getByText("Reports content")).toBeInTheDocument();
    });

    // Story has a real car equivalent now too - same Insights group as
    // Reports, same expectation.
    it("still shows The Story So Far as a real, clickable nav item for a car-active session", async () => {
      const user = userEvent.setup();
      render(<DashboardShell {...carProps()} />);
      const insightsHeader = screen.getAllByRole("button", { name: /Insights/ })[0];
      await user.click(insightsHeader);

      expect(screen.getByRole("button", { name: "The Story So Far" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "The Story So Far" }));
      expect(screen.getByText("Story content")).toBeInTheDocument();
    });

    // Shareable Links has a real car equivalent now - it must actually
    // render as a clickable nav item for a car-active session.
    it("still shows Shareable Links as a real, clickable nav item for a car-active session", async () => {
      const user = userEvent.setup();
      render(<DashboardShell {...carProps()} />);
      const sellingHeader = screen.getAllByRole("button", { name: /Selling/ })[0];
      await user.click(sellingHeader);

      expect(screen.getByRole("button", { name: "Shareable Links" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Shareable Links" }));
      expect(screen.getByText("ShareLinks content")).toBeInTheDocument();
    });

    // Transfer ownership has a real car equivalent now too - same
    // Selling group as Shareable Links, same expectation. This was the
    // last entry of CAR_UNAVAILABLE_SECTIONS to come off the list.
    it("still shows Transfer ownership as a real, clickable nav item for a car-active session", async () => {
      const user = userEvent.setup();
      render(<DashboardShell {...carProps()} />);
      const sellingHeader = screen.getAllByRole("button", { name: /Selling/ })[0];
      await user.click(sellingHeader);

      expect(screen.getByRole("button", { name: "Transfer ownership" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Transfer ownership" }));
      expect(screen.getByText("TransferOwnership content")).toBeInTheDocument();
    });

    // Quote Checker/Cost calculator/Buying a used car all have real car
    // equivalents now (standalone /cars/quote-checker etc, wired into
    // the dashboard's own tabs) - they must render as real, clickable
    // nav items for a car-active session, not just be absent from the
    // unavailable-labels list above.
    it("still shows all three buying tools as real, clickable nav items for a car-active session, with a car-flavoured buying-guide label", async () => {
      const user = userEvent.setup();
      render(<DashboardShell {...carProps()} />);
      const buyingToolsHeader = screen.getAllByRole("button", { name: /Buying Tools/ })[0];
      await user.click(buyingToolsHeader);

      // Not "Buying a used bike" - that was a real bug (NAV_GROUPS is
      // shared by both vehicle kinds, and only this one label mentions
      // the kind by name; see DashboardShell.tsx's navLabelFor).
      expect(screen.queryByRole("button", { name: "Buying a used bike" })).not.toBeInTheDocument();

      for (const [label, content] of [
        ["Quote Checker", "QuoteChecker content"],
        ["Cost calculator", "CostCalculator content"],
        ["Buying a used car", "BuyingGuide content"],
      ]) {
        expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: label }));
        expect(screen.getByText(content)).toBeInTheDocument();
      }
    });

    it("hides every CAR_UNAVAILABLE_SECTIONS label from the mobile More sheet (currently a no-op - the list is empty)", async () => {
      const user = userEvent.setup();
      render(<DashboardShell {...carProps()} />);
      await user.click(screen.getByRole("button", { name: /More/ }));
      for (const label of CAR_UNAVAILABLE_LABELS) {
        expect(screen.queryByText(label)).not.toBeInTheDocument();
      }
      // Also present in the always-mounted sidebar nav, hence getAllByText.
      expect(screen.getAllByText("Settings").length).toBeGreaterThan(0);
    });

    // Selling has two real, available items now (Shareable Links and
    // Transfer ownership) - full car/bike parity, no unavailable items
    // left in this group at all. Expanding it should show both real
    // items, not the empty-state note (that note is still exercised
    // elsewhere for groups that genuinely have nothing).
    it("shows the Selling group's two real car items (Shareable Links, Transfer ownership) rather than the empty-state note", async () => {
      const user = userEvent.setup();
      render(<DashboardShell {...carProps()} />);

      // Selling also has its own mobile-bottom-bar icon (always
      // mounted, just CSS-hidden by media query) - the sidebar's own
      // copy is the first match.
      const header = screen.getAllByRole("button", { name: /Selling/ })[0];
      expect(header).toBeInTheDocument();
      await user.click(header);
      expect(screen.getByRole("button", { name: "Shareable Links" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Transfer ownership" })).toBeInTheDocument();
    });

    // RefreshCarDataButton now has its own real route
    // (/api/cars/car/refresh-data), so a car-active session gets the
    // refresh button too - it just posts carId instead of bikeId.
    it("labels the switcher card 'My car' and shows the refresh button, wired to the car route", () => {
      render(<DashboardShell {...carProps()} />);
      expect(screen.getByText("My car")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Refresh vehicle data" })).toBeInTheDocument();
    });

    it("PATCHes /api/cars/car (not /api/tracker/bike) when updating mileage", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
      const user = userEvent.setup();
      render(<DashboardShell {...carProps()} />);
      await user.click(screen.getAllByRole("button", { name: "Update mileage" })[0]);
      await user.click(screen.getAllByRole("button", { name: "Save" })[0]);
      expect(fetch).toHaveBeenCalledWith("/api/cars/car", expect.objectContaining({ method: "PATCH" }));
    });
  });

  describe("sidebar identity", () => {
    it("shows the raw email and initials-from-email by default", () => {
      render(<DashboardShell {...baseProps()} />);
      expect(screen.getByText("rider@example.com")).toBeInTheDocument();
      expect(screen.getByText("RI")).toBeInTheDocument();
    });

    it("prefers the display name over the email, once one is set", () => {
      render(<DashboardShell {...baseProps({ displayName: "Alex" })} />);
      expect(screen.getByText("Alex")).toBeInTheDocument();
      expect(screen.queryByText("rider@example.com")).not.toBeInTheDocument();
      expect(screen.getByText("AL")).toBeInTheDocument();
    });

    it("renders the real avatar image instead of initials when hasAvatar is set", () => {
      render(<DashboardShell {...baseProps({ hasAvatar: true })} />);
      expect(screen.getAllByAltText("Your avatar")[0]).toHaveAttribute("src", "/api/account/avatar");
      expect(screen.queryByText("RI")).not.toBeInTheDocument();
    });
  });

  describe("pending-deletion banner", () => {
    it("renders nothing when pendingDeletion isn't set", () => {
      render(<DashboardShell {...baseProps()} />);
      expect(screen.queryByText(/Pending deletion/)).not.toBeInTheDocument();
    });

    it("shows the day count regardless of which tab is active", async () => {
      const user = userEvent.setup();
      render(<DashboardShell {...baseProps({ pendingDeletion: { daysRemaining: 12 } })} />);

      expect(screen.getByText(/Pending deletion/)).toBeInTheDocument();
      expect(screen.getByText(/12 days/)).toBeInTheDocument();

      await user.click(screen.getAllByRole("button", { name: "Fuel" })[0]);
      expect(screen.getByText(/Pending deletion/)).toBeInTheDocument();
    });

    it("uses singular 'day' for exactly one day remaining", () => {
      render(<DashboardShell {...baseProps({ pendingDeletion: { daysRemaining: 1 } })} />);
      expect(screen.getByText(/1 day\./)).toBeInTheDocument();
    });

    it("cancelling posts to /api/account/cancel-deletion", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
      const user = userEvent.setup();
      render(<DashboardShell {...baseProps({ pendingDeletion: { daysRemaining: 5 } })} />);

      await user.click(screen.getByRole("button", { name: "Cancel deletion" }));
      expect(fetch).toHaveBeenCalledWith("/api/account/cancel-deletion", expect.objectContaining({ method: "POST" }));
    });
  });
});
