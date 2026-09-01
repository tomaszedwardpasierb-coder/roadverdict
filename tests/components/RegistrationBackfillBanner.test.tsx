// Place at: tests/components/RegistrationBackfillBanner.test.tsx
//
// Banner prompting the one-time registration backfill fronting
// setOriginalRegistration (src/lib/tracker/bike.ts) - once saved there,
// the real endpoint locks it in permanently. Only fetch and
// next/navigation's useRouter are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { RegistrationBackfillBanner } from "@/app/dashboard/RegistrationBackfillBanner";

describe("RegistrationBackfillBanner", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    refresh.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names the specific bike in the prompt", () => {
    render(<RegistrationBackfillBanner bikeName="Yamaha MT-07" />);
    expect(screen.getByText(/One more thing for Yamaha MT-07/)).toBeInTheDocument();
  });

  it("a whitespace-only registration is blocked by the guard even though the input's own required attribute is satisfied", async () => {
    // Typing only spaces passes the input's `required` (non-empty string)
    // but the handler's own `!registration.trim()` guard should still
    // stop the submit - this is what actually enforces "a real
    // registration, not a placeholder".
    const user = userEvent.setup();
    render(<RegistrationBackfillBanner bikeName="Yamaha MT-07" />);
    await user.type(screen.getByPlaceholderText("e.g. AB12 CDE"), "   ");
    await user.click(screen.getByRole("button", { name: "Save registration" }));

    expect(fetch).not.toHaveBeenCalled();
  });

  it("submits the entered registration and refreshes the page on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<RegistrationBackfillBanner bikeName="Yamaha MT-07" />);
    await user.type(screen.getByPlaceholderText("e.g. AB12 CDE"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Save registration" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bike/set-original-registration",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ registration: "AB12CDE" }) })
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows the server's own error message on a non-ok response", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "That registration is already in use." }) });
    const user = userEvent.setup();
    render(<RegistrationBackfillBanner bikeName="Yamaha MT-07" />);
    await user.type(screen.getByPlaceholderText("e.g. AB12 CDE"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Save registration" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That registration is already in use.");
  });

  it("shows a connection error when fetch itself throws", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("down"));
    const user = userEvent.setup();
    render(<RegistrationBackfillBanner bikeName="Yamaha MT-07" />);
    await user.type(screen.getByPlaceholderText("e.g. AB12 CDE"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Save registration" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
  });
});
