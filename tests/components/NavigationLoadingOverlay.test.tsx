// Place at: tests/components/NavigationLoadingOverlay.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname.current,
}));

import { NavigationLoadingOverlay } from "@/components/NavigationLoadingOverlay";
import { ActiveSectionProvider, useActiveSection } from "@/components/ActiveSectionContext";

// Mirrors how DashboardShell actually publishes vehicleKind in
// production (a real child calling the real setter), not a mock.
function SetVehicleKind({ kind }: { kind: "bike" | "car" | null }) {
  const { setVehicleKind } = useActiveSection();
  setVehicleKind(kind);
  return null;
}

function renderOverlay(linkHref: string, opts: { vehicleKind?: "bike" | "car" | null; linkProps?: Record<string, string> } = {}) {
  return render(
    <ActiveSectionProvider>
      {opts.vehicleKind !== undefined && <SetVehicleKind kind={opts.vehicleKind} />}
      <a href={linkHref} {...opts.linkProps}>
        Go
      </a>
      <NavigationLoadingOverlay />
    </ActiveSectionProvider>
  );
}

beforeEach(() => {
  mockPathname.current = "/";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("NavigationLoadingOverlay", () => {
  it("renders nothing before any navigation is clicked", () => {
    renderOverlay("/somewhere-else");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the overlay after clicking a same-origin link to a different page", async () => {
    const user = userEvent.setup();
    renderOverlay("/somewhere-else");
    await user.click(screen.getByText("Go"));
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });

  it("hides again once the pathname actually changes", async () => {
    const user = userEvent.setup();
    const { rerender } = renderOverlay("/somewhere-else");
    await user.click(screen.getByText("Go"));
    expect(await screen.findByRole("status")).toBeInTheDocument();

    mockPathname.current = "/somewhere-else";
    rerender(
      <ActiveSectionProvider>
        <a href="/somewhere-else">Go</a>
        <NavigationLoadingOverlay />
      </ActiveSectionProvider>
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("ignores a click on a link to the current page", async () => {
    const user = userEvent.setup();
    renderOverlay("/");
    await user.click(screen.getByText("Go"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("ignores a hash-only link", async () => {
    const user = userEvent.setup();
    renderOverlay("#section");
    await user.click(screen.getByText("Go"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("ignores an external link", async () => {
    const user = userEvent.setup();
    renderOverlay("https://example.com/elsewhere");
    await user.click(screen.getByText("Go"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("ignores a link that opens in a new tab", async () => {
    const user = userEvent.setup();
    renderOverlay("/somewhere-else", { linkProps: { target: "_blank" } });
    await user.click(screen.getByText("Go"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("ignores a ctrl/cmd-click (opens in a new tab, not a same-page navigation)", () => {
    renderOverlay("/somewhere-else");
    fireEvent.click(screen.getByText("Go"), { button: 0, ctrlKey: true });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("themes the spinner as a car wheel when ActiveSectionContext says the dashboard is car-active", async () => {
    const user = userEvent.setup();
    renderOverlay("/somewhere-else", { vehicleKind: "car" });
    await user.click(screen.getByText("Go"));
    const status = await screen.findByRole("status");
    expect(status.querySelectorAll("path").length).toBeGreaterThan(0);
  });

  it("falls back to a pathname-based guess (car) when there's no dashboard context at all", async () => {
    mockPathname.current = "/cars/buying-guide";
    const user = userEvent.setup();
    renderOverlay("/car-report/abc123/detailed");
    await user.click(screen.getByText("Go"));
    const status = await screen.findByRole("status");
    expect(status.querySelectorAll("path").length).toBeGreaterThan(0);
  });

  it("defaults to bike when neither dashboard context nor pathname gives a clear signal", async () => {
    const user = userEvent.setup();
    renderOverlay("/some-unrelated-page");
    await user.click(screen.getByText("Go"));
    const status = await screen.findByRole("status");
    expect(status.querySelectorAll("line").length).toBeGreaterThan(0);
  });

  it("clears itself via the safety timeout if the pathname never actually changes", () => {
    vi.useFakeTimers();
    renderOverlay("/somewhere-else");
    fireEvent.click(screen.getByText("Go"), { button: 0 });
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(12_001); });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
