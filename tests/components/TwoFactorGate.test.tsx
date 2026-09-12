// Place at: tests/components/TwoFactorGate.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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

  it("links to the dashboard's security tab", () => {
    render(
      <TwoFactorGate twoFactorEnabled={false}>
        <div>Real Vault content</div>
      </TwoFactorGate>
    );
    const link = screen.getByRole("link", { name: "Go to Settings" });
    expect(link).toHaveAttribute("href", "/dashboard?tab=security");
  });
});
