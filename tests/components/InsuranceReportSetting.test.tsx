// Place at: tests/components/InsuranceReportSetting.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

import { InsuranceReportSetting } from "@/app/dashboard/InsuranceReportSetting";

describe("InsuranceReportSetting", () => {
  beforeEach(() => {
    mockRouter.refresh.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders unchecked when insurance is excluded (the default)", () => {
    render(<InsuranceReportSetting includeInsuranceInReport={false} />);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("renders checked when insurance is already included", () => {
    render(<InsuranceReportSetting includeInsuranceInReport />);
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("asks for confirmation before turning it on, and does nothing if declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<InsuranceReportSetting includeInsuranceInReport={false} />);

    await user.click(screen.getByRole("checkbox"));

    expect(window.confirm).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("PATCHes includeInsuranceInReport true once confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<InsuranceReportSetting includeInsuranceInReport={false} />);

    await user.click(screen.getByRole("checkbox"));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bike",
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
    render(<InsuranceReportSetting includeInsuranceInReport />);

    await user.click(screen.getByRole("checkbox"));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bike",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ includeInsuranceInReport: false }),
      })
    );
  });
});
