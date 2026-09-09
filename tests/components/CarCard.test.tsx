// Place at: tests/components/CarCard.test.tsx
//
// Car equivalent of BikeCard.test.tsx - deliberately smaller, since
// CarCard itself has no registration-change form or prior-history
// request flow (neither has a car-side route yet). Covers the
// active-vs-inactive dashboard switch, the read-only/transferred state,
// and delete confirmation. Only `fetch`, `window.confirm`, and
// next/navigation's useRouter are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

import { CarCard } from "@/app/garage/CarCard";

const baseProps = {
  carId: "car-1",
  name: "The Runabout",
  year: 2019,
  currentMileage: 12000,
  isActive: false,
};

describe("CarCard", () => {
  beforeEach(() => {
    mockRouter.push.mockClear();
    mockRouter.refresh.mockClear();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("confirm", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the active badge and mileage/year for a non-custom car", () => {
    render(<CarCard {...baseProps} isActive />);
    expect(screen.getByText("Currently viewing")).toBeInTheDocument();
    expect(screen.getByText(/2019 · 12,000 miles/)).toBeInTheDocument();
  });

  it("shows 'Custom build' instead of a year when isCustomBuild is set", () => {
    render(<CarCard {...baseProps} isCustomBuild year={undefined} />);
    expect(screen.getByText(/Custom build · 12,000 miles/)).toBeInTheDocument();
  });

  it("clicking 'View dashboard' on the already-active car just navigates, without calling the API", async () => {
    const user = userEvent.setup();
    render(<CarCard {...baseProps} isActive />);
    await user.click(screen.getByRole("button", { name: "View dashboard" }));

    expect(fetch).not.toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith("/dashboard");
  });

  it("clicking 'View dashboard' on an inactive car sets it active first, then navigates", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<CarCard {...baseProps} isActive={false} />);
    await user.click(screen.getByRole("button", { name: "View dashboard" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/active-car",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ carId: "car-1" }),
      })
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/dashboard");
  });

  it("does not navigate if switching the active car fails server-side", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    render(<CarCard {...baseProps} isActive={false} />);
    await user.click(screen.getByRole("button", { name: "View dashboard" }));

    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("a transferred (read-only) car shows the read-only badge and hides Delete", () => {
    render(<CarCard {...baseProps} transferredToEmail="newowner@example.com" currentRegistration="AB12CDE" />);

    expect(screen.getByText("Read-only - transferred to newowner@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View dashboard" })).toBeInTheDocument();
  });

  it("an active, non-transferred car with a registration shows Delete and the registration", () => {
    render(<CarCard {...baseProps} currentRegistration="AB12CDE" />);
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByText("AB12CDE")).toBeInTheDocument();
  });

  it("clicking Delete without confirming makes no API call", async () => {
    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const user = userEvent.setup();
    render(<CarCard {...baseProps} currentRegistration="AB12CDE" />);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(fetch).not.toHaveBeenCalled();
  });

  it("confirming Delete calls the car's DELETE endpoint and refreshes on success", async () => {
    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<CarCard {...baseProps} carId="car with space" />);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(fetch).toHaveBeenCalledWith("/api/cars/car/car%20with%20space", { method: "DELETE" });
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
  });

  it("shows the server's own error message when delete fails, without refreshing", async () => {
    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "This car still has active reminders." }),
    });
    const user = userEvent.setup();
    render(<CarCard {...baseProps} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This car still has active reminders.");
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });
});
