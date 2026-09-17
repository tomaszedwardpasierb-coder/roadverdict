// Place at: tests/components/AssistantProposedEntryCard.test.tsx
//
// New test file for this card - it didn't have one yet. Scoped to the
// "Log it" confirm-save flow just enough to pin the VehicleSpinner
// wiring: the spinner shows alongside the button's own existing
// "Logging…" text while the POST is in flight, themed bike for every
// category except service/labour/fine/toll (the only ones whose
// endpoint/vehicle actually varies - see the component's own
// getEndpoint), and from the entry's real vehicleKind field for those.
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
  vehicleKind: "bike",
};

const carServiceEntry: ProposedEntry = {
  category: "service",
  jobType: "valet",
  jobLabel: "Valet / detailing",
  description: "Full interior and exterior valet",
  cost: 60,
  date: "2026-01-01",
  mileage: 32000,
  vehicleKind: "car",
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

const bikeFineEntry: ProposedEntry = {
  category: "fine",
  fineType: "speeding",
  fineLabel: "Speeding (fixed penalty / NIP)",
  description: "Caught on a speed camera",
  cost: 100,
  date: "2026-01-01",
  vehicleKind: "bike",
};

const carTollEntry: ProposedEntry = {
  category: "toll",
  tollType: "parking",
  tollLabel: "Parking",
  description: "Outside the office",
  cost: 4,
  date: "2026-01-01",
  vehicleKind: "car",
};

const bikeBillEntry: ProposedEntry = {
  category: "bill",
  billType: "insurance",
  billLabel: "Insurance",
  description: "Annual renewal",
  cost: 300,
  date: "2026-01-01",
  vehicleKind: "bike",
};

const carBillEntry: ProposedEntry = {
  category: "bill",
  billType: "finance",
  billLabel: "Finance",
  description: "Monthly PCP payment",
  cost: 250,
  date: "2026-01-01",
  vehicleKind: "car",
};

const bikeModEntry: ProposedEntry = {
  category: "mod",
  modCategory: "tank-pads",
  modLabel: "Tank pads / protectors",
  description: "Tank pads",
  cost: 20,
  date: "2026-01-01",
  mileage: 12000,
  vehicleKind: "bike",
};

const carModEntry: ProposedEntry = {
  category: "mod",
  modCategory: "dash-cam",
  modLabel: "Dash cam",
  description: "Dash cam",
  cost: 90,
  date: "2026-01-01",
  mileage: 32000,
  vehicleKind: "car",
};

const bikeFuelEntry: ProposedEntry = {
  category: "fuel",
  litres: 12,
  cost: 18,
  date: "2026-01-01",
  mileage: 12000,
  filledToFull: true,
  vehicleKind: "bike",
};

const carFuelEntry: ProposedEntry = {
  category: "fuel",
  litres: 40,
  cost: 60,
  date: "2026-01-01",
  mileage: 32000,
  filledToFull: false,
  vehicleKind: "car",
};

const carChargingEntry: ProposedEntry = {
  category: "fuel",
  kwh: 35,
  cost: 12,
  date: "2026-01-01",
  mileage: 32000,
  filledToFull: false,
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

  it("a service entry is pre-checked with its job type's own reminder default, and includes it in the POST body", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<AssistantProposedEntryCard entry={serviceEntry} />);

    expect(screen.getByLabelText(/Remind me when this is due again/)).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Log it" }));

    await screen.findByText(/Logged/);
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body).reminder).toEqual({ intervalType: "mileage", intervalValue: 4000 });
  });

  it("a job type with no reminder default (Other) leaves the box unchecked, and the reminder out of the POST body", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<AssistantProposedEntryCard entry={{ ...serviceEntry, jobType: "other", jobLabel: "Other" }} />);

    expect(screen.getByLabelText(/Remind me when this is due again/)).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Log it" }));

    await screen.findByText(/Logged/);
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body).reminder).toBeUndefined();
  });

  it("shows the bike spinner alongside the confirm button's own 'Logging…' text while the request is in flight, for a bike service entry", async () => {
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

  it("a car service entry posts to the car services endpoint, with the car job catalog's own label", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<AssistantProposedEntryCard entry={carServiceEntry} />);
    await user.click(screen.getByRole("button", { name: "Log it" }));

    expect(await screen.findByText(/Logged - Valet \/ detailing/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/cars/car-services", expect.objectContaining({ method: "POST" }));
  });

  it("a bike labour entry keeps the bike wheel and posts to the bike labour endpoint", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<AssistantProposedEntryCard entry={bikeLabourEntry} />);
    await user.click(screen.getByRole("button", { name: "Log it" }));

    expect(await screen.findByText(/Logged/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/tracker/labour", expect.objectContaining({ method: "POST" }));
  });

  // Fine and Toll are the other two categories that vary by vehicle kind
  // (see getEndpoint) - no mileage field on either, unlike every category
  // above except a plain bill.
  it("a bike fine entry posts to the bike fines endpoint, with no mileage field rendered", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<AssistantProposedEntryCard entry={bikeFineEntry} />);

    expect(screen.queryByLabelText("Mileage")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Log it" }));

    expect(await screen.findByText(/Logged - Speeding/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/tracker/fines", expect.objectContaining({ method: "POST" }));
  });

  it("a car toll entry posts to the car tolls endpoint, with no mileage field rendered", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<AssistantProposedEntryCard entry={carTollEntry} />);

    expect(screen.queryByLabelText("Mileage")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Log it" }));

    expect(await screen.findByText(/Logged - Parking/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/cars/car-tolls", expect.objectContaining({ method: "POST" }));
  });

  describe("bill (now vehicle-kind-aware, unlike before)", () => {
    it("a bike bill posts to the bike bills endpoint, pre-checked with insurance's real 12-month default", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
      const user = userEvent.setup();
      render(<AssistantProposedEntryCard entry={bikeBillEntry} />);

      expect(screen.getByLabelText(/Remind me when this is due for renewal/)).toBeChecked();
      await user.click(screen.getByRole("button", { name: "Log it" }));

      expect(await screen.findByText(/Logged - Insurance/)).toBeInTheDocument();
      const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({
        billType: "insurance", cost: 300, date: "2026-01-01", notes: "Annual renewal",
        reminder: { intervalType: "months", intervalValue: 12 },
      });
      expect(fetch).toHaveBeenCalledWith("/api/tracker/bills", expect.objectContaining({ method: "POST" }));
    });

    it("a car bill posts to the car bills endpoint, always pre-checked even with no per-type default (finance)", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
      const user = userEvent.setup();
      render(<AssistantProposedEntryCard entry={carBillEntry} />);

      expect(screen.getByLabelText(/Remind me when this is due for renewal/)).toBeChecked();
      await user.click(screen.getByRole("button", { name: "Log it" }));

      expect(await screen.findByText(/Logged - Finance/)).toBeInTheDocument();
      expect(fetch).toHaveBeenCalledWith("/api/cars/car-bills", expect.objectContaining({ method: "POST" }));
    });

    it("unchecking the reminder box leaves it out of the POST body entirely", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
      const user = userEvent.setup();
      render(<AssistantProposedEntryCard entry={bikeBillEntry} />);

      await user.click(screen.getByLabelText(/Remind me when this is due for renewal/));
      await user.click(screen.getByRole("button", { name: "Log it" }));

      await screen.findByText(/Logged/);
      const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(JSON.parse(init.body).reminder).toBeUndefined();
    });

    it("switching bill type re-suggests the new type's own reminder default", async () => {
      const user = userEvent.setup();
      render(<AssistantProposedEntryCard entry={bikeBillEntry} />);
      await user.selectOptions(screen.getByLabelText("Bill type"), "road-tax");
      expect(screen.getByLabelText(/Remind me when this is due for renewal/)).toBeChecked();
    });
  });

  describe("mod (now vehicle-kind-aware, no reminder concept at all)", () => {
    it("a bike mod posts to the bike mods endpoint, with no reminder UI rendered", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
      const user = userEvent.setup();
      render(<AssistantProposedEntryCard entry={bikeModEntry} />);

      expect(screen.queryByText(/Remind me/)).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Log it" }));

      expect(await screen.findByText(/Logged - Tank pads/)).toBeInTheDocument();
      expect(fetch).toHaveBeenCalledWith("/api/tracker/mods", expect.objectContaining({ method: "POST" }));
    });

    it("a car mod posts to the car mods endpoint, with the car catalog's own label", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
      const user = userEvent.setup();
      render(<AssistantProposedEntryCard entry={carModEntry} />);
      await user.click(screen.getByRole("button", { name: "Log it" }));

      expect(await screen.findByText(/Logged - Dash cam/)).toBeInTheDocument();
      expect(fetch).toHaveBeenCalledWith("/api/cars/car-mods", expect.objectContaining({ method: "POST" }));
    });
  });

  describe("fuel (litres vs kWh, driven by which field the draft itself carries)", () => {
    it("a bike fuel entry shows Litres and posts to the bike fuel endpoint", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
      const user = userEvent.setup();
      render(<AssistantProposedEntryCard entry={bikeFuelEntry} />);

      expect(screen.getByLabelText("Litres")).toHaveValue(12);
      await user.click(screen.getByRole("button", { name: "Log it" }));

      await screen.findByText(/Logged - Fuel fill-up/);
      expect(fetch).toHaveBeenCalledWith("/api/tracker/fuel", expect.objectContaining({ method: "POST" }));
    });

    it("a non-electric car fuel entry shows Litres and the Filled to full checkbox, posting to the car fuel endpoint", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
      const user = userEvent.setup();
      render(<AssistantProposedEntryCard entry={carFuelEntry} />);

      expect(screen.getByLabelText("Litres")).toHaveValue(40);
      expect(screen.getByText("Filled to full")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Log it" }));

      const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({
        litres: 40, cost: 60, mileage: 32000, date: "2026-01-01", filledToFull: false, mileageAcknowledged: false,
      });
      expect(fetch).toHaveBeenCalledWith("/api/cars/car-fuel", expect.objectContaining({ method: "POST" }));
    });

    it("an electric car charging entry shows kWh instead of Litres, hides Filled to full entirely, and posts kwh not litres", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
      const user = userEvent.setup();
      render(<AssistantProposedEntryCard entry={carChargingEntry} />);

      expect(screen.getByLabelText("kWh")).toHaveValue(35);
      expect(screen.queryByLabelText("Litres")).not.toBeInTheDocument();
      expect(screen.queryByText("Filled to full")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Log it" }));

      expect(await screen.findByText(/Logged - Charging session/)).toBeInTheDocument();
      const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({
        kwh: 35, cost: 12, mileage: 32000, date: "2026-01-01", filledToFull: false, mileageAcknowledged: false,
      });
      expect(fetch).toHaveBeenCalledWith("/api/cars/car-fuel", expect.objectContaining({ method: "POST" }));
    });
  });

  describe("editing an existing entry (entry.entryId set)", () => {
    const editServiceEntry: ProposedEntry = { ...serviceEntry, cost: 55, entryId: "sr-1" };
    const editCarBillEntry: ProposedEntry = { ...carBillEntry, cost: 260, entryId: "cb-1" };

    it("shows an 'Edit' title and a 'Save changes' button instead of 'New'/'Log it'", () => {
      render(<AssistantProposedEntryCard entry={editServiceEntry} />);
      expect(screen.getByText("Edit service record")).toBeInTheDocument();
      expect(screen.queryByText("New service record")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Log it" })).not.toBeInTheDocument();
    });

    it("PATCHes <endpoint>/<entryId> instead of POSTing to the bare endpoint, and shows 'Updated' on success", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
      const user = userEvent.setup();
      render(<AssistantProposedEntryCard entry={editServiceEntry} />);

      await user.click(screen.getByRole("button", { name: "Save changes" }));

      expect(await screen.findByText(/Updated - Basic service/)).toBeInTheDocument();
      expect(fetch).toHaveBeenCalledWith("/api/tracker/services/sr-1", expect.objectContaining({ method: "PATCH" }));
    });

    it("PATCHes the car bill endpoint with its own entryId for a car-active edit", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
      const user = userEvent.setup();
      render(<AssistantProposedEntryCard entry={editCarBillEntry} />);

      await user.click(screen.getByRole("button", { name: "Save changes" }));

      expect(await screen.findByText(/Updated/)).toBeInTheDocument();
      expect(fetch).toHaveBeenCalledWith("/api/cars/car-bills/cb-1", expect.objectContaining({ method: "PATCH" }));
    });

    it("shows the server's own error message on a failed save, without showing the updated confirmation", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "Please fill in all required fields." }) });
      const user = userEvent.setup();
      render(<AssistantProposedEntryCard entry={editServiceEntry} />);

      await user.click(screen.getByRole("button", { name: "Save changes" }));

      expect(await screen.findByText("Please fill in all required fields.")).toBeInTheDocument();
      expect(screen.queryByText(/Updated/)).not.toBeInTheDocument();
    });
  });
});
