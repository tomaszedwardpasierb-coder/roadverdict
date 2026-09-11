// Place at: tests/components/DeleteAccountModal.test.tsx
//
// The dashboard's own self-serve account-deletion confirmation (distinct
// from the admin-only DeleteAccountButton under /tomasz, which has its
// own test file). Rendered from SettingsTab for both a bike-active and a
// car-active dashboard session, so its spinner is read from the shared
// ActiveSectionContext rather than hardcoded - see AssistantWidget.test.tsx's
// own SetVehicleKind helper for the pattern mirrored below. Only `fetch`
// and next/navigation's useRouter are mocked.
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { DeleteAccountModal } from "@/app/dashboard/DeleteAccountModal";
import { ActiveSectionProvider, useActiveSection } from "@/components/ActiveSectionContext";

function SetVehicleKind({ kind }: { kind: "bike" | "car" }) {
  const { setVehicleKind } = useActiveSection();
  useEffect(() => setVehicleKind(kind), [kind, setVehicleKind]);
  return null;
}

describe("DeleteAccountModal", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    refresh.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps 'Delete my account' disabled until exactly DELETE is typed", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountModal onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Delete my account" })).toBeDisabled();
    await user.type(screen.getByLabelText(/Type/), "delete");
    expect(screen.getByRole("button", { name: "Delete my account" })).toBeDisabled();

    await user.clear(screen.getByLabelText(/Type/));
    await user.type(screen.getByLabelText(/Type/), "DELETE");
    expect(screen.getByRole("button", { name: "Delete my account" })).toBeEnabled();
  });

  it("on confirmation, requests deletion and closes, refreshing the page", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<DeleteAccountModal onClose={onClose} />);
    await user.type(screen.getByLabelText(/Type/), "DELETE");
    await user.click(screen.getByRole("button", { name: "Delete my account" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/account/request-deletion",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ confirmText: "DELETE" }) })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the server's own error and does not close on failure", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "Could not schedule it." }) });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<DeleteAccountModal onClose={onClose} />);
    await user.type(screen.getByLabelText(/Type/), "DELETE");
    await user.click(screen.getByRole("button", { name: "Delete my account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not schedule it.");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a connection error when fetch itself throws", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("down"));
    const user = userEvent.setup();
    render(<DeleteAccountModal onClose={vi.fn()} />);
    await user.type(screen.getByLabelText(/Type/), "DELETE");
    await user.click(screen.getByRole("button", { name: "Delete my account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach roadverdict/i);
  });

  it("Cancel closes the modal without touching the network", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<DeleteAccountModal onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  // Rendered with no ActiveSectionProvider (as every test above),
  // useActiveSection's no-provider fallback (vehicleKind: null) applies,
  // which defaults to the bike wheel.
  it("shows the bike spinner while the request is in flight, with no provider in scope", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(<DeleteAccountModal onClose={vi.fn()} />);
    await user.type(screen.getByLabelText(/Type/), "DELETE");
    await user.click(screen.getByRole("button", { name: "Delete my account" }));

    const button = screen.getByRole("button", { name: "Scheduling…" });
    expect(button.querySelector("svg")).toBeInTheDocument();
    expect(button.querySelectorAll("path").length).toBe(0); // bike wheel, not car

    resolveFetch({ ok: true, json: async () => ({}) });
  });

  it("shows the car spinner while the request is in flight, when the dashboard's active vehicle is a car", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(
      <ActiveSectionProvider>
        <SetVehicleKind kind="car" />
        <DeleteAccountModal onClose={vi.fn()} />
      </ActiveSectionProvider>
    );
    await user.type(screen.getByLabelText(/Type/), "DELETE");
    await user.click(screen.getByRole("button", { name: "Delete my account" }));

    const button = screen.getByRole("button", { name: "Scheduling…" });
    expect(button.querySelectorAll("path").length).toBeGreaterThan(0); // car wheel

    resolveFetch({ ok: true, json: async () => ({}) });
  });
});
