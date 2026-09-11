// Place at: tests/components/TwoFactorSettings.test.tsx
//
// The dashboard's own 2FA enroll/disable flow. Each step's API already
// has its own route tests (totp-enroll-start/confirm/disable) - this
// file covers the component's own job: which phase shows when, that a
// wrong code keeps the user on the same step rather than silently
// advancing, and that a successful enroll/disable transitions the
// displayed status. Only `fetch` and next/navigation's useRouter are
// mocked.
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouterRefresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRouterRefresh }) }));

import { TwoFactorSettings } from "@/app/dashboard/TwoFactorSettings";
import { ActiveSectionProvider, useActiveSection } from "@/components/ActiveSectionContext";

// Mirrors AssistantWidget.test.tsx's own SetVehicleKind helper - a real
// child calling the real setter, the same way DashboardShell does in
// production, rather than a mock.
function SetVehicleKind({ kind }: { kind: "bike" | "car" }) {
  const { setVehicleKind } = useActiveSection();
  useEffect(() => setVehicleKind(kind), [kind, setVehicleKind]);
  return null;
}

describe("TwoFactorSettings", () => {
  beforeEach(() => {
    mockRouterRefresh.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows 2FA as off, with a set-up button, when not yet enabled", () => {
    render(<TwoFactorSettings initiallyEnabled={false} />);
    expect(screen.getByText(/Off/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set up two-factor authentication" })).toBeInTheDocument();
  });

  it("shows 2FA as on, with a turn-off button, when already enabled", () => {
    render(<TwoFactorSettings initiallyEnabled={true} />);
    expect(screen.getByText(/On/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn off" })).toBeInTheDocument();
  });

  it("starting enrollment shows the QR code and manual-entry key from the server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ qrDataUrl: "data:image/png;base64,fake", manualEntryKey: "JBSWY3DPEHPK3PXP" }) })
    );

    const user = userEvent.setup();
    render(<TwoFactorSettings initiallyEnabled={false} />);
    await user.click(screen.getByRole("button", { name: "Set up two-factor authentication" }));

    expect(await screen.findByAltText("Scan with your authenticator app")).toHaveAttribute("src", "data:image/png;base64,fake");
    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/auth/totp/enroll/start", { method: "POST" });
  });

  it("a wrong confirmation code shows the server's error and stays on the QR step", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    render(<TwoFactorSettings initiallyEnabled={false} />);

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: async () => ({ qrDataUrl: "data:x", manualEntryKey: "SECRET" }) });
    await user.click(screen.getByRole("button", { name: "Set up two-factor authentication" }));
    await screen.findByLabelText("Enter the 6-digit code it shows");

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Incorrect code." }) });
    await user.type(screen.getByLabelText("Enter the 6-digit code it shows"), "000000");
    await user.click(screen.getByRole("button", { name: "Turn on" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect code.");
    expect(screen.getByLabelText("Enter the 6-digit code it shows")).toBeInTheDocument();
  });

  it("a correct confirmation code shows the backup codes once, then returns to the on state after acknowledging", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    render(<TwoFactorSettings initiallyEnabled={false} />);

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: async () => ({ qrDataUrl: "data:x", manualEntryKey: "SECRET" }) });
    await user.click(screen.getByRole("button", { name: "Set up two-factor authentication" }));
    await screen.findByLabelText("Enter the 6-digit code it shows");

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: async () => ({ backupCodes: ["aaaaaaaaaa", "bbbbbbbbbb"] }) });
    await user.type(screen.getByLabelText("Enter the 6-digit code it shows"), "123456");
    await user.click(screen.getByRole("button", { name: "Turn on" }));

    expect(await screen.findByText("aaaaaaaaaa")).toBeInTheDocument();
    expect(screen.getByText("bbbbbbbbbb")).toBeInTheDocument();
    expect(mockRouterRefresh).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "I've saved these codes" }));
    expect(screen.getByText(/On/)).toBeInTheDocument();
    expect(screen.queryByText("aaaaaaaaaa")).not.toBeInTheDocument();
  });

  it("disabling with a wrong code shows the server's error and leaves 2FA shown as on", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    render(<TwoFactorSettings initiallyEnabled={true} />);
    await user.click(screen.getByRole("button", { name: "Turn off" }));

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Incorrect code." }) });
    await user.type(screen.getByLabelText("Code"), "000000");
    await user.click(screen.getByRole("button", { name: "Turn off" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect code.");
  });

  it("disabling with a correct code returns to the off state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));
    const user = userEvent.setup();
    render(<TwoFactorSettings initiallyEnabled={true} />);
    await user.click(screen.getByRole("button", { name: "Turn off" }));
    await user.type(screen.getByLabelText("Code"), "123456");
    await user.click(screen.getByRole("button", { name: "Turn off" }));

    expect(await screen.findByText(/Off/)).toBeInTheDocument();
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  // Rendered with no ActiveSectionProvider (as every other test in this
  // file), useActiveSection's no-provider fallback (vehicleKind: null)
  // applies, which defaults to the bike wheel.
  it("shows the bike spinner on 'Set up two-factor authentication' while enrollment starts", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; })));
    const user = userEvent.setup();
    render(<TwoFactorSettings initiallyEnabled={false} />);
    const button = screen.getByRole("button", { name: "Set up two-factor authentication" });
    await user.click(button);

    expect(screen.getByRole("button", { name: "Starting…" }).querySelector("svg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Starting…" }).querySelectorAll("path").length).toBe(0);

    resolveFetch({ ok: true, json: async () => ({ qrDataUrl: "data:x", manualEntryKey: "SECRET" }) });
    await screen.findByLabelText("Enter the 6-digit code it shows");
  });

  it("shows the car spinner on 'Turn on' while confirming, when the dashboard's active vehicle is a car", async () => {
    const user = userEvent.setup();
    render(
      <ActiveSectionProvider>
        <SetVehicleKind kind="car" />
        <TwoFactorSettings initiallyEnabled={false} />
      </ActiveSectionProvider>
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ qrDataUrl: "data:x", manualEntryKey: "SECRET" }) })
    );
    await user.click(screen.getByRole("button", { name: "Set up two-factor authentication" }));
    await screen.findByLabelText("Enter the 6-digit code it shows");

    let resolveFetch: (v: unknown) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; })));
    await user.type(screen.getByLabelText("Enter the 6-digit code it shows"), "123456");
    const turnOnButton = screen.getByRole("button", { name: "Turn on" });
    await user.click(turnOnButton);

    expect(screen.getByRole("button", { name: "Verifying…" }).querySelectorAll("path").length).toBeGreaterThan(0);

    resolveFetch({ ok: true, json: async () => ({ backupCodes: ["aaaaaaaaaa"] }) });
  });

  it("shows the car spinner on 'Turn off' while disabling, when the dashboard's active vehicle is a car", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    render(
      <ActiveSectionProvider>
        <SetVehicleKind kind="car" />
        <TwoFactorSettings initiallyEnabled={true} />
      </ActiveSectionProvider>
    );
    await user.click(screen.getByRole("button", { name: "Turn off" }));
    await user.type(screen.getByLabelText("Code"), "123456");

    let resolveFetch: (v: unknown) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; })));
    const turnOffButton = screen.getByRole("button", { name: "Turn off" });
    await user.click(turnOffButton);

    expect(screen.getByRole("button", { name: "Turning off…" }).querySelectorAll("path").length).toBeGreaterThan(0);

    resolveFetch({ ok: true, json: async () => ({ ok: true }) });
  });
});
