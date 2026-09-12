// Place at: tests/components/TwoFactorGate.test.tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { TwoFactorGate } from "@/app/dashboard/TwoFactorGate";

describe("TwoFactorGate", () => {
  beforeEach(() => {
    push.mockClear();
  });

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

  it("navigates to the dashboard's security tab when clicked", async () => {
    const user = userEvent.setup();
    render(
      <TwoFactorGate twoFactorEnabled={false}>
        <div>Real Vault content</div>
      </TwoFactorGate>
    );

    await user.click(screen.getByRole("button", { name: "Go to Settings" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard?tab=security"));
  });
});
