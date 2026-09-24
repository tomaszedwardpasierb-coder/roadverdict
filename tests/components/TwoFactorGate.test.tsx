// Place at: tests/components/TwoFactorGate.test.tsx
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TwoFactorGate } from "@/app/dashboard/TwoFactorGate";

describe("TwoFactorGate", () => {
  it("renders the real content when 2FA is enabled", () => {
    render(
      <TwoFactorGate twoFactorEnabled={true}>
        <div>Real Vault content</div>
      </TwoFactorGate>
    );
    expect(screen.getByText("Real Vault content")).toBeInTheDocument();
  });

  it("renders the enable-2FA prompt, not the real content, when 2FA is disabled", () => {
    render(
      <TwoFactorGate twoFactorEnabled={false}>
        <div>Real Vault content</div>
      </TwoFactorGate>
    );
    expect(screen.queryByText("Real Vault content")).not.toBeInTheDocument();
    expect(screen.getByText("The Vault requires two-factor authentication")).toBeInTheDocument();
  });

  // Nobody should have to enable 2FA blind - the prompt has to say what the
  // Vault is for before asking for the effort.
  it("explains what the Vault is for before asking the visitor to enable 2FA", () => {
    render(
      <TwoFactorGate twoFactorEnabled={false}>
        <div>Real Vault content</div>
      </TwoFactorGate>
    );
    expect(screen.getByText(/private place to keep the paperwork behind each vehicle/i)).toBeInTheDocument();
    expect(screen.getByText(/V5C, insurance and MOT certificates/i)).toBeInTheDocument();
    expect(screen.getByText(/locks itself after 10 minutes of inactivity/i)).toBeInTheDocument();
  });

  describe("clicking Go to Settings", () => {
    let originalLocation: Location;

    beforeEach(() => {
      originalLocation = window.location;
      // @ts-expect-error - deliberately replacing location to observe the navigation without jsdom navigating for real, same pattern as BuyingGuideForm.test.tsx's Stripe-redirect tests.
      delete window.location;
      // @ts-expect-error - see above
      window.location = { ...originalLocation, href: "" };
    });

    afterEach(() => {
      // @ts-expect-error - restoring the real Location object after the stub above
      window.location = originalLocation;
    });

    it("navigates to the dashboard's security tab via a real page navigation, not a client-side route push", async () => {
      const user = userEvent.setup();
      render(
        <TwoFactorGate twoFactorEnabled={false}>
          <div>Real Vault content</div>
        </TwoFactorGate>
      );

      await user.click(screen.getByRole("button", { name: "Go to Settings" }));

      await waitFor(() => expect(window.location.href).toBe("/dashboard?tab=security"));
    });

    it("shows a spinner and disables the button once clicked", async () => {
      const user = userEvent.setup();
      render(
        <TwoFactorGate twoFactorEnabled={false}>
          <div>Real Vault content</div>
        </TwoFactorGate>
      );

      await user.click(screen.getByRole("button", { name: "Go to Settings" }));

      const button = screen.getByRole("button", { name: "Opening Settings…" });
      expect(button).toBeDisabled();
      expect(button.querySelector("svg")).toBeInTheDocument();
    });
  });
});
