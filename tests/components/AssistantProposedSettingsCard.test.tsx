// Place at: tests/components/AssistantProposedSettingsCard.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { AssistantProposedSettingsCard, type ProposedSettingsChange } from "@/components/AssistantProposedSettingsCard";

describe("AssistantProposedSettingsCard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    refresh.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("renders only the fields the draft actually carries", () => {
    const change: ProposedSettingsChange = { category: "settings", vehicleKind: "bike", currentMileage: 16000 };
    render(<AssistantProposedSettingsCard change={change} />);

    expect(screen.getByLabelText("Current mileage")).toHaveValue(16000);
    expect(screen.queryByLabelText("Region")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Currency")).not.toBeInTheDocument();
    expect(screen.queryByText(/buyer report/)).not.toBeInTheDocument();
  });

  it("PATCHes only the changed field to the bike endpoint", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    const change: ProposedSettingsChange = { category: "settings", vehicleKind: "bike", currentMileage: 16000 };
    render(<AssistantProposedSettingsCard change={change} />);

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("✓ Settings updated")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bike",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ currentMileage: 16000 }) })
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("PATCHes to the car endpoint for a car-active draft", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    const change: ProposedSettingsChange = { category: "settings", vehicleKind: "car", currency: "EUR" };
    render(<AssistantProposedSettingsCard change={change} />);

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(fetch).toHaveBeenCalledWith("/api/cars/car", expect.objectContaining({ method: "PATCH" }));
  });

  it("rejects a negative mileage before submitting, without calling fetch", async () => {
    const user = userEvent.setup();
    const change: ProposedSettingsChange = { category: "settings", vehicleKind: "bike", currentMileage: 16000 };
    render(<AssistantProposedSettingsCard change={change} />);

    await user.clear(screen.getByLabelText("Current mileage"));
    await user.type(screen.getByLabelText("Current mileage"), "-5");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Enter a valid mileage.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("renders a buyer-report toggle checked/unchecked according to the draft, and includes an edited value in the PATCH body", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    const change: ProposedSettingsChange = { category: "settings", vehicleKind: "bike", includeCleaningInReport: false };
    render(<AssistantProposedSettingsCard change={change} />);

    const checkbox = screen.getByLabelText("Show valeting/washing costs in buyer report");
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bike",
      expect.objectContaining({ body: JSON.stringify({ includeCleaningInReport: true }) })
    );
  });

  it("shows the server's own error message and does not show the saved confirmation", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "Enter a valid mileage." }) });
    const user = userEvent.setup();
    const change: ProposedSettingsChange = { category: "settings", vehicleKind: "bike", currentMileage: 16000 };
    render(<AssistantProposedSettingsCard change={change} />);

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Enter a valid mileage.")).toBeInTheDocument();
    expect(screen.queryByText("✓ Settings updated")).not.toBeInTheDocument();
  });

  it("bundles several changed fields into one PATCH body", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    const change: ProposedSettingsChange = { category: "settings", vehicleKind: "bike", currentMileage: 16000, region: "scotland-ni" };
    render(<AssistantProposedSettingsCard change={change} />);

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bike",
      expect.objectContaining({ body: JSON.stringify({ currentMileage: 16000, region: "scotland-ni" }) })
    );
  });
});
