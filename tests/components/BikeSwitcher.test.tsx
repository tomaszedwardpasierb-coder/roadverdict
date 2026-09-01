// Place at: tests/components/BikeSwitcher.test.tsx
//
// The sidebar's multi-bike switcher - drives ACTIVE_BIKE_COOKIE server
// side via /api/tracker/active-bike (see pickActiveBike in
// src/lib/tracker/bike.ts for the fallback-to-first-bike semantics this
// mirrors client-side when activeBikeId doesn't match anything in the
// list). Only `fetch` and next/navigation's useRouter are mocked; the
// real next/link renders un-mocked since nothing here ever clicks it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

import { BikeSwitcher, type SwitcherBike } from "@/app/dashboard/BikeSwitcher";

const bikeA: SwitcherBike = { id: "a", name: "CB500", year: 2019, currentMileage: 8000 };
const bikeB: SwitcherBike = { id: "b", name: "MT-07", year: 2022, currentMileage: 12000 };

function openDropdown(container: HTMLElement) {
  return within(container).getByText("Manage bikes →").closest("div") as HTMLElement;
}

describe("BikeSwitcher", () => {
  beforeEach(() => {
    mockRouter.refresh.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing for an empty bike list", () => {
    const { container } = render(<BikeSwitcher bikes={[]} activeBikeId="x" distanceUnit="mi" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("a single bike renders the static card with no dropdown trigger, plus a link to add another", () => {
    render(<BikeSwitcher bikes={[bikeA]} activeBikeId="a" distanceUnit="mi" />);
    expect(screen.getByText("CB500")).toBeInTheDocument();
    expect(screen.getByText(/2019.*8,000 miles/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add another bike/ })).toHaveAttribute("href", "/garage");
  });

  it("shows 'Custom build' in place of a missing year", () => {
    render(<BikeSwitcher bikes={[{ id: "a", name: "Kit bike", currentMileage: 100 }]} activeBikeId="a" distanceUnit="mi" />);
    expect(screen.getByText(/Custom build.*100 miles/)).toBeInTheDocument();
  });

  it("falls back to the first bike in the list when activeBikeId matches none of them", () => {
    render(<BikeSwitcher bikes={[bikeA, bikeB]} activeBikeId="does-not-exist" distanceUnit="mi" />);
    expect(screen.getByRole("button", { name: /My bike/ })).toHaveTextContent("CB500");
  });

  it("multiple bikes render a collapsed trigger that expands into a dropdown listing every bike", async () => {
    const user = userEvent.setup();
    const { container } = render(<BikeSwitcher bikes={[bikeA, bikeB]} activeBikeId="a" distanceUnit="mi" />);
    const trigger = screen.getByRole("button", { name: /My bike/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Manage bikes →")).not.toBeInTheDocument();

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const dropdown = openDropdown(container);
    expect(within(dropdown).getByText("CB500", { exact: false })).toBeInTheDocument();
    expect(within(dropdown).getByText("MT-07", { exact: false })).toBeInTheDocument();
  });

  it("clicking the already-active bike in the dropdown just closes it, with no fetch and no refresh", async () => {
    const user = userEvent.setup();
    const { container } = render(<BikeSwitcher bikes={[bikeA, bikeB]} activeBikeId="a" distanceUnit="mi" />);
    await user.click(screen.getByRole("button", { name: /My bike/ }));
    const dropdown = openDropdown(container);
    await user.click(within(dropdown).getByText("CB500", { exact: false }));

    expect(fetch).not.toHaveBeenCalled();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
    expect(screen.queryByText("Manage bikes →")).not.toBeInTheDocument();
  });

  it("switching to a different bike posts its id and refreshes the page on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    const { container } = render(<BikeSwitcher bikes={[bikeA, bikeB]} activeBikeId="a" distanceUnit="mi" />);
    await user.click(screen.getByRole("button", { name: /My bike/ }));
    const dropdown = openDropdown(container);
    await user.click(within(dropdown).getByText("MT-07", { exact: false }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/active-bike",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ bikeId: "b" }),
      })
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
    expect(screen.queryByText("Manage bikes →")).not.toBeInTheDocument();
  });

  it("a failed switch does not refresh the page and leaves the dropdown open", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    const { container } = render(<BikeSwitcher bikes={[bikeA, bikeB]} activeBikeId="a" distanceUnit="mi" />);
    await user.click(screen.getByRole("button", { name: /My bike/ }));
    const dropdown = openDropdown(container);
    await user.click(within(dropdown).getByText("MT-07", { exact: false }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(mockRouter.refresh).not.toHaveBeenCalled();
    expect(screen.getByText("Manage bikes →")).toBeInTheDocument();
  });
});
