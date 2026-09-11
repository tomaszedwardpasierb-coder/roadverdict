// Place at: tests/components/AssistantProposedEntryCard.test.tsx
//
// New test file for this card - it didn't have one yet. Scoped to the
// "Log it" confirm-save flow just enough to pin the VehicleSpinner
// wiring: the spinner shows alongside the button's own existing
// "Logging…" text while the POST is in flight, themed bike for every
// category except labour (the only one whose endpoint/vehicle actually
// varies - see the component's own getEndpoint), and from the entry's
// real vehicleKind field for that one category.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { AssistantProposedEntryCard, type ProposedEntry } from "@/components/AssistantProposedEntryCard";

const serviceEntry: ProposedEntry = {
  category: "service",
  jobType: "basic-service",
  jobLabel: "Basic service",
  description: "Routine oil and filter change",
  cost: 45,
  date: "2026-01-01",
  mileage: 12000,
};

const bikeLabourEntry: ProposedEntry = {
  category: "labour",
  labourCategory: "full-service",
  labourLabel: "Full motorcycle service",
  description: "Full service at a workshop",
  cost: 180,
  date: "2026-01-01",
  mileage: 12500,
  vehicleKind: "bike",
};

const carLabourEntry: ProposedEntry = {
  category: "labour",
  labourCategory: "full-service",
  labourLabel: "Full car service",
  description: "Full service at a workshop",
  cost: 220,
  date: "2026-01-01",
  mileage: 32000,
  vehicleKind: "car",
};

describe("AssistantProposedEntryCard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    refresh.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the entry to the real endpoint and shows the logged confirmation on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<AssistantProposedEntryCard entry={serviceEntry} />);
    await user.click(screen.getByRole("button", { name: "Log it" }));

    expect(await screen.findByText(/Logged - Basic service/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/tracker/services", expect.objectContaining({ method: "POST" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the bike spinner alongside the confirm button's own 'Logging…' text while the request is in flight, for a bike-only category", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(<AssistantProposedEntryCard entry={serviceEntry} />);
    await user.click(screen.getByRole("button", { name: "Log it" }));

    const button = screen.getByRole("button", { name: "Logging…" });
    expect(button.querySelectorAll("line").length).toBe(8);
    expect(button.querySelectorAll("path").length).toBe(0);

    resolveFetch({ ok: true, json: async () => ({}) });
    await screen.findByText(/Logged/);
  });

  it("themes the spinner from the entry's own vehicleKind for a labour entry - a car entry renders the car wheel (path elements), never the bike wheel's wire spokes", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(<AssistantProposedEntryCard entry={carLabourEntry} />);
    await user.click(screen.getByRole("button", { name: "Log it" }));

    const button = screen.getByRole("button", { name: "Logging…" });
    expect(button.querySelectorAll("path").length).toBe(5);
    expect(button.querySelectorAll("line").length).toBe(0);

    resolveFetch({ ok: true, json: async () => ({}) });
    await screen.findByText(/Logged/);
    expect(fetch).toHaveBeenCalledWith("/api/cars/car-labour", expect.objectContaining({ method: "POST" }));
  });

  it("a bike labour entry keeps the bike wheel and posts to the bike labour endpoint", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<AssistantProposedEntryCard entry={bikeLabourEntry} />);
    await user.click(screen.getByRole("button", { name: "Log it" }));

    expect(await screen.findByText(/Logged/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/tracker/labour", expect.objectContaining({ method: "POST" }));
  });
});
