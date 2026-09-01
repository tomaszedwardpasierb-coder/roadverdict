// Place at: tests/components/SetRegionForm.test.tsx
//
// Region picker. Only fetch and next/navigation's useRouter (via
// useTrackerFormSubmit) are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { SetRegionForm } from "@/app/dashboard/SetRegionForm";

describe("SetRegionForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to Rest of England & Wales and lists all real regions", () => {
    render(<SetRegionForm />);
    const select = screen.getByLabelText("Where you keep and run it");
    expect(select).toHaveValue("rest-england-wales");
    expect(screen.getByRole("option", { name: "London & South East" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Scotland & Northern Ireland" })).toBeInTheDocument();
  });

  it("submits the newly selected region as a PATCH", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<SetRegionForm />);

    await user.selectOptions(screen.getByLabelText("Where you keep and run it"), "london-se");
    await user.click(screen.getByRole("button", { name: "Save and continue" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bike",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ region: "london-se" }) })
    );
  });

  it("shows the server's own error message on a non-ok response", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "Could not save region." }) });
    const user = userEvent.setup();
    render(<SetRegionForm />);
    await user.click(screen.getByRole("button", { name: "Save and continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save region.");
  });
});
