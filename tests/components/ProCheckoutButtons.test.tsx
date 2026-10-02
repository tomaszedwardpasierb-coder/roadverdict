// Place at: tests/components/ProCheckoutButtons.test.tsx
// Same window.location.href stub pattern as VdiCheckSection.test.tsx -
// a successful checkout/portal-session creation redirects with a hard
// assignment, not router.push.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProSubscribeButtons, ManageBillingButton } from "@/components/ProCheckoutButtons";

describe("ProCheckoutButtons", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, href: "" },
      writable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("ProSubscribeButtons", () => {
    it("offers the free trial on both buttons when the account would get one", () => {
      render(<ProSubscribeButtons trialDays={14} />);
      expect(screen.getByText(/Your first 14 days are free/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Start free trial - then £5.99/mo" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Start free trial - then £59/yr (2 months free)" })).toBeInTheDocument();
    });

    it("mentions no trial to someone who has had Pro before", () => {
      render(<ProSubscribeButtons trialDays={0} />);
      expect(screen.queryByText(/days are free/)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Subscribe monthly - £5.99/mo" })).toBeInTheDocument();
    });

    it("shows the general new-to-Pro line where the page doesn't know", () => {
      render(<ProSubscribeButtons />);
      expect(screen.getByText("New to Pro? Your first 14 days are free.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Subscribe monthly - £5.99/mo" })).toBeInTheDocument();
    });

    it("posts interval 'monthly' and redirects to the returned URL on the monthly button", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ url: "https://checkout.stripe.com/session123" }) });
      const user = userEvent.setup();
      render(<ProSubscribeButtons />);

      await user.click(screen.getByRole("button", { name: /Subscribe monthly/ }));

      expect(fetch).toHaveBeenCalledWith(
        "/api/pro/checkout",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ interval: "monthly" }) })
      );
      expect(window.location.href).toBe("https://checkout.stripe.com/session123");
    });

    it("posts interval 'annual' on the annual button", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ url: "https://checkout.stripe.com/session456" }) });
      const user = userEvent.setup();
      render(<ProSubscribeButtons />);

      await user.click(screen.getByRole("button", { name: /Subscribe annually/ }));

      expect(fetch).toHaveBeenCalledWith(
        "/api/pro/checkout",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ interval: "annual" }) })
      );
      expect(window.location.href).toBe("https://checkout.stripe.com/session456");
    });

    it("shows the server's error message and re-enables the buttons on failure, without redirecting", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "Your account already has Pro." }) });
      const user = userEvent.setup();
      render(<ProSubscribeButtons />);

      await user.click(screen.getByRole("button", { name: /Subscribe monthly/ }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Your account already has Pro.");
      expect(window.location.href).toBe("");
      expect(screen.getByRole("button", { name: /Subscribe monthly/ })).toBeEnabled();
    });

    it("shows a connection error, not an unhandled rejection, when fetch itself throws", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
      const user = userEvent.setup();
      render(<ProSubscribeButtons />);

      await user.click(screen.getByRole("button", { name: /Subscribe monthly/ }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't reach the payment service/);
    });
  });

  describe("ManageBillingButton", () => {
    it("posts to the billing-portal route and redirects to the returned URL", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ url: "https://billing.stripe.com/session_abc" }) });
      const user = userEvent.setup();
      render(<ManageBillingButton />);

      await user.click(screen.getByRole("button", { name: "Manage billing" }));

      expect(fetch).toHaveBeenCalledWith("/api/pro/billing-portal", expect.objectContaining({ method: "POST" }));
      expect(window.location.href).toBe("https://billing.stripe.com/session_abc");
    });

    it("shows an error and stays put when the portal session can't be created", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "No billing account found for this account." }) });
      const user = userEvent.setup();
      render(<ManageBillingButton />);

      await user.click(screen.getByRole("button", { name: "Manage billing" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("No billing account found for this account.");
      expect(window.location.href).toBe("");
    });
  });
});
