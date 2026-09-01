// Place at: tests/components/BikeCard.test.tsx
//
// A bike summary card in the multi-bike garage view. Covers the
// active-vs-inactive dashboard switch, the read-only/transferred state
// (isBikeReadOnly in src/lib/tracker/bike.ts drives which bikes get
// this treatment server-side; here we just verify the card hides
// change-registration/delete once transferredToEmail is set), delete
// confirmation, the registration-change form, and the prior-history
// request flow. Only `fetch`, `window.confirm`, and next/navigation's
// useRouter are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

import { BikeCard } from "@/app/garage/BikeCard";

const baseProps = {
  bikeId: "bike-1",
  name: "My Fireblade",
  year: 2019,
  currentMileage: 12000,
  isActive: false,
  registrationChangeCount: 0,
};

describe("BikeCard", () => {
  beforeEach(() => {
    mockRouter.push.mockClear();
    mockRouter.refresh.mockClear();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("confirm", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the active badge and mileage/year for a non-custom bike", () => {
    render(<BikeCard {...baseProps} isActive />);
    expect(screen.getByText("Currently viewing")).toBeInTheDocument();
    expect(screen.getByText(/2019 · 12,000 miles/)).toBeInTheDocument();
  });

  it("shows 'Custom build' instead of a year when isCustomBuild is set", () => {
    render(<BikeCard {...baseProps} isCustomBuild year={undefined} />);
    expect(screen.getByText(/Custom build · 12,000 miles/)).toBeInTheDocument();
  });

  it("clicking 'View dashboard' on the already-active bike just navigates, without calling the API", async () => {
    const user = userEvent.setup();
    render(<BikeCard {...baseProps} isActive />);
    await user.click(screen.getByRole("button", { name: "View dashboard" }));

    expect(fetch).not.toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith("/dashboard");
  });

  it("clicking 'View dashboard' on an inactive bike sets it active first, then navigates", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<BikeCard {...baseProps} isActive={false} />);
    await user.click(screen.getByRole("button", { name: "View dashboard" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/active-bike",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ bikeId: "bike-1" }),
      })
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/dashboard");
  });

  it("does not navigate if switching the active bike fails server-side", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    render(<BikeCard {...baseProps} isActive={false} />);
    await user.click(screen.getByRole("button", { name: "View dashboard" }));

    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("a transferred (read-only) bike shows the read-only badge and hides Delete and Change registration", () => {
    render(<BikeCard {...baseProps} transferredToEmail="newowner@example.com" currentRegistration="AB12CDE" />);

    expect(screen.getByText("Read-only - transferred to newowner@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change registration" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View dashboard" })).toBeInTheDocument();
  });

  it("an active, non-transferred bike with a registration shows both Delete and Change registration", () => {
    render(<BikeCard {...baseProps} currentRegistration="AB12CDE" />);
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change registration" })).toBeInTheDocument();
  });

  it("a bike with no registration at all hides the Change registration button (nothing to change)", () => {
    render(<BikeCard {...baseProps} />);
    expect(screen.queryByRole("button", { name: "Change registration" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("shows the registration-change count note when it's greater than zero", () => {
    render(<BikeCard {...baseProps} currentRegistration="AB12CDE" registrationChangeCount={2} />);
    expect(screen.getByText("(2 changes on record)")).toBeInTheDocument();
  });

  it("clicking Delete without confirming makes no API call", async () => {
    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const user = userEvent.setup();
    render(<BikeCard {...baseProps} currentRegistration="AB12CDE" />);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(fetch).not.toHaveBeenCalled();
  });

  it("confirming Delete calls the bike's DELETE endpoint and refreshes on success", async () => {
    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<BikeCard {...baseProps} bikeId="bike with space" />);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(fetch).toHaveBeenCalledWith("/api/tracker/bike/bike%20with%20space", { method: "DELETE" });
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
  });

  it("shows the server's own error message when delete fails, without refreshing", async () => {
    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "This bike still has active reminders." }),
    });
    const user = userEvent.setup();
    render(<BikeCard {...baseProps} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This bike still has active reminders.");
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  it("opens and closes the registration-change form via the toggle button", async () => {
    const user = userEvent.setup();
    render(<BikeCard {...baseProps} currentRegistration="AB12CDE" />);

    await user.click(screen.getByRole("button", { name: "Change registration" }));
    expect(screen.getByLabelText("New registration")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("New registration")).not.toBeInTheDocument();
  });

  it("submitting the registration-change form without confirming makes no API call", async () => {
    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const user = userEvent.setup();
    render(<BikeCard {...baseProps} currentRegistration="AB12CDE" />);
    await user.click(screen.getByRole("button", { name: "Change registration" }));
    await user.type(screen.getByLabelText("New registration"), "XY99ZZZ");
    await user.click(screen.getByRole("button", { name: "Record change" }));

    expect(fetch).not.toHaveBeenCalled();
  });

  it("confirming the registration change posts the new plate and reason, then closes the form and refreshes", async () => {
    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<BikeCard {...baseProps} currentRegistration="AB12CDE" />);
    await user.click(screen.getByRole("button", { name: "Change registration" }));
    await user.type(screen.getByLabelText("New registration"), "XY99ZZZ");
    await user.selectOptions(screen.getByLabelText("Reason"), "private-plate-removed");
    await user.click(screen.getByRole("button", { name: "Record change" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bike/registration-change",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ bikeId: "bike-1", plate: "XY99ZZZ", reason: "private-plate-removed" }),
      })
    );
    expect(await screen.findByRole("button", { name: "Change registration" })).toBeInTheDocument();
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
  });

  it("shows the server's own error and leaves the form open when the registration change fails", async () => {
    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "That plate is already registered to another of your bikes." }),
    });
    const user = userEvent.setup();
    render(<BikeCard {...baseProps} currentRegistration="AB12CDE" />);
    await user.click(screen.getByRole("button", { name: "Change registration" }));
    await user.type(screen.getByLabelText("New registration"), "XY99ZZZ");
    await user.click(screen.getByRole("button", { name: "Record change" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That plate is already registered to another of your bikes.");
    expect(screen.getByLabelText("New registration")).toBeInTheDocument();
  });

  it("shows the prior-history prompt only when mayHavePriorHistory is set and the bike isn't already transferred", () => {
    render(<BikeCard {...baseProps} mayHavePriorHistory currentRegistration="AB12CDE" />);
    expect(screen.getByText(/may have RoadVerdict history logged by a previous owner/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request it" })).toBeInTheDocument();
  });

  it("hides the prior-history prompt on a transferred bike even if mayHavePriorHistory is set", () => {
    render(<BikeCard {...baseProps} mayHavePriorHistory transferredToEmail="x@example.com" currentRegistration="AB12CDE" />);
    expect(screen.queryByText(/may have RoadVerdict history/)).not.toBeInTheDocument();
  });

  it("requesting prior history posts this bike's registration and shows a sent confirmation", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<BikeCard {...baseProps} mayHavePriorHistory currentRegistration="AB12CDE" />);
    await user.click(screen.getByRole("button", { name: "Request it" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bike-transfer/request-ownership",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ registration: "AB12CDE" }),
      })
    );
    expect(await screen.findByText(/Request sent/)).toBeInTheDocument();
  });

  it("shows the server's own error message when the history request fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "You already have a pending request for this bike." }),
    });
    const user = userEvent.setup();
    render(<BikeCard {...baseProps} mayHavePriorHistory currentRegistration="AB12CDE" />);
    await user.click(screen.getByRole("button", { name: "Request it" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You already have a pending request for this bike.");
  });
});
