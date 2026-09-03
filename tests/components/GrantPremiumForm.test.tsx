// Place at: tests/components/GrantPremiumForm.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

import { GrantPremiumForm } from "@/app/tomasz/GrantPremiumForm";

describe("GrantPremiumForm", () => {
  beforeEach(() => mockRouter.refresh.mockClear());
  afterEach(() => vi.unstubAllGlobals());

  describe("when the account has no active plan", () => {
    it("shows a date input and a disabled Grant button until a date is chosen", () => {
      render(<GrantPremiumForm email="rider@example.com" plan={null} />);
      expect(screen.getByRole("button", { name: "Grant" })).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
    });

    it("posts the chosen date as an ISO expiresAt and refreshes on success", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));

      const user = userEvent.setup();
      render(<GrantPremiumForm email="rider@example.com" plan={null} />);
      const dateInput = screen.getByLabelText("Premium expiry date for rider@example.com");
      await user.type(dateInput, "2027-06-15");
      await user.click(screen.getByRole("button", { name: "Grant" }));

      expect(fetch).toHaveBeenCalledWith(
        "/api/tomasz/accounts/grant-premium",
        expect.objectContaining({
          body: JSON.stringify({ email: "rider@example.com", expiresAt: new Date("2027-06-15").toISOString() }),
        })
      );
      await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
    });

    it("shows the server's error (e.g. the 3-year cap) and does not refresh on failure", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Grants can't exceed 3 years." }) }));

      const user = userEvent.setup();
      render(<GrantPremiumForm email="rider@example.com" plan={null} />);
      await user.type(screen.getByLabelText("Premium expiry date for rider@example.com"), "2030-01-01");
      await user.click(screen.getByRole("button", { name: "Grant" }));

      expect(await screen.findByText("Grants can't exceed 3 years.")).toBeInTheDocument();
      expect(mockRouter.refresh).not.toHaveBeenCalled();
    });
  });

  describe("when the account already has an active plan", () => {
    it("shows days remaining and a Revoke button instead of the date form", () => {
      const expiresAt = new Date(Date.now() + 10 * 86_400_000).toISOString();
      render(<GrantPremiumForm email="rider@example.com" plan={{ expiresAt }} />);

      expect(screen.getByText(/10 days left/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Revoke" })).toBeInTheDocument();
      expect(screen.queryByLabelText("Premium expiry date for rider@example.com")).not.toBeInTheDocument();
    });

    it("revokes on confirm and refreshes on success", async () => {
      vi.stubGlobal("confirm", vi.fn(() => true));
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));

      const user = userEvent.setup();
      const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
      render(<GrantPremiumForm email="rider@example.com" plan={{ expiresAt }} />);
      await user.click(screen.getByRole("button", { name: "Revoke" }));

      expect(fetch).toHaveBeenCalledWith(
        "/api/tomasz/accounts/revoke-premium",
        expect.objectContaining({ body: JSON.stringify({ email: "rider@example.com" }) })
      );
      await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
    });

    it("does not call the API if the revoke confirmation is declined", async () => {
      vi.stubGlobal("confirm", vi.fn(() => false));
      vi.stubGlobal("fetch", vi.fn());

      const user = userEvent.setup();
      const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
      render(<GrantPremiumForm email="rider@example.com" plan={{ expiresAt }} />);
      await user.click(screen.getByRole("button", { name: "Revoke" }));

      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
