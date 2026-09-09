// Mirrors ExcludeFromReportToggle.test.tsx for the car equivalent, whose
// only real difference from the bike component is the PATCH endpoint.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

import { CarExcludeFromReportToggle } from "@/app/dashboard/CarExcludeFromReportToggle";

const insuranceProps = {
  fieldName: "includeInsuranceInReport" as const,
  checkboxLabel: "Show insurance history in my buyer report",
  confirmMessage: "Show insurance anyway?",
  noteText: "Off by default.",
};

describe("CarExcludeFromReportToggle", () => {
  beforeEach(() => {
    mockRouter.refresh.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders unchecked when excluded (the default)", () => {
    render(<CarExcludeFromReportToggle {...insuranceProps} included={false} />);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByText(insuranceProps.checkboxLabel)).toBeInTheDocument();
  });

  it("renders checked when already included", () => {
    render(<CarExcludeFromReportToggle {...insuranceProps} included />);
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("asks for confirmation before turning it on, and does nothing if declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<CarExcludeFromReportToggle {...insuranceProps} included={false} />);

    await user.click(screen.getByRole("checkbox"));

    expect(window.confirm).toHaveBeenCalledWith(insuranceProps.confirmMessage);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("PATCHes /api/cars/car with the given fieldName as true once confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<CarExcludeFromReportToggle {...insuranceProps} included={false} />);

    await user.click(screen.getByRole("checkbox"));

    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/car",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ includeInsuranceInReport: true }),
      })
    );
  });

  it("turning it off never asks for confirmation", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const confirmSpy = vi.spyOn(window, "confirm");
    const user = userEvent.setup();
    render(<CarExcludeFromReportToggle {...insuranceProps} included />);

    await user.click(screen.getByRole("checkbox"));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/car",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ includeInsuranceInReport: false }),
      })
    );
  });

  it("uses fieldName to PATCH a different setting entirely for the finance instance", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(
      <CarExcludeFromReportToggle
        fieldName="includeFinanceInReport"
        included={false}
        checkboxLabel="Show finance history in my buyer report"
        confirmMessage="Show finance anyway?"
        noteText="Off by default."
      />
    );

    await user.click(screen.getByRole("checkbox"));

    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/car",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ includeFinanceInReport: true }),
      })
    );
  });
});
