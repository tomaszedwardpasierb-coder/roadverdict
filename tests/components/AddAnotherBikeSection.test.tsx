// Place at: tests/components/AddAnotherBikeSection.test.tsx
//
// Small by design: three states driven entirely by props/local state -
// at the free-bike cap (no form, just a notice), under the cap with the
// form collapsed (a button), and expanded (the real AddBikeForm, which
// has its own dedicated test elsewhere - only checked for here to be
// present, not re-exercised).
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// AddBikeForm (rendered once expanded below) uses the shared
// useTrackerFormSubmit hook, which calls next/navigation's useRouter -
// not exercised by anything AddAnotherBikeSection itself does, but
// needed just to let AddBikeForm mount without Next's real app router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { AddAnotherBikeSection } from "@/app/garage/AddAnotherBikeSection";

describe("AddAnotherBikeSection", () => {
  it("shows the free-tier cap notice, with no add button, once bikeCount reaches maxFreeBikes", () => {
    render(<AddAnotherBikeSection bikeCount={2} maxFreeBikes={2} />);
    expect(screen.getByText(/Free accounts can track up to 2 bikes/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add another bike/ })).not.toBeInTheDocument();
  });

  it("also shows the cap notice when bikeCount somehow exceeds the cap", () => {
    render(<AddAnotherBikeSection bikeCount={3} maxFreeBikes={2} />);
    expect(screen.getByText(/Free accounts can track up to 2 bikes/)).toBeInTheDocument();
  });

  it("under the cap, shows the add button instead of the form or the notice", () => {
    render(<AddAnotherBikeSection bikeCount={1} maxFreeBikes={2} />);
    expect(screen.getByRole("button", { name: "+ Add another bike" })).toBeInTheDocument();
    expect(screen.queryByText(/Free accounts can track up to/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Registration/i)).not.toBeInTheDocument();
  });

  it("clicking the add button swaps it for the real AddBikeForm", async () => {
    const user = userEvent.setup();
    render(<AddAnotherBikeSection bikeCount={1} maxFreeBikes={2} />);
    await user.click(screen.getByRole("button", { name: "+ Add another bike" }));

    expect(screen.queryByRole("button", { name: "+ Add another bike" })).not.toBeInTheDocument();
    // AddBikeForm renders its own submit control - its exact label is
    // covered by AddBikeForm's own tests, so just assert a form appeared.
    expect(document.querySelector("form")).toBeInTheDocument();
  });
});
