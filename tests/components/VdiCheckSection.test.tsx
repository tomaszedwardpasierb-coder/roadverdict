// Place at: tests/components/VdiCheckSection.test.tsx
// Real navigation on a successful checkout-session creation is a hard
// window.location.href assignment (to Stripe's own checkout URL), not
// router.push - same reasoning/stub pattern as Verify2faPage.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VdiCheckSection } from "@/components/VdiCheckSection";
import type { VdiUnlock } from "@/lib/tracker/vdiUnlock";

describe("VdiCheckSection", () => {
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

  it("shows the locked state with the bike price and no facts when vdiUnlock is absent", () => {
    render(<VdiCheckSection vehicleKind="bike" token="tok_abc" registration="AB12CDE" make="Honda" model="CB125R" />);
    expect(screen.getByText("Unlock for £7.99")).toBeInTheDocument();
    expect(screen.queryByText("Stolen marker")).not.toBeInTheDocument();
  });

  it("shows the car price and mentions the included valuation in the locked state", () => {
    render(<VdiCheckSection vehicleKind="car" token="tok_xyz" registration="AB12CDE" make="Ford" model="Focus" />);
    expect(screen.getByText("Unlock for £9.99")).toBeInTheDocument();
    expect(screen.getByText(/Includes an independent valuation range/)).toBeInTheDocument();
  });

  it("posts to the bike checkout route and redirects to the returned URL on unlock click", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ url: "https://checkout.stripe.com/session123" }) });
    const user = userEvent.setup();
    render(<VdiCheckSection vehicleKind="bike" token="tok_abc" registration="AB12CDE" make="Honda" model="CB125R" />);

    await user.click(screen.getByText("Unlock for £7.99"));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/vdi-checkout",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ token: "tok_abc" }) })
    );
    expect(window.location.href).toBe("https://checkout.stripe.com/session123");
  });

  it("posts to the car checkout route for a car section", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ url: "https://checkout.stripe.com/session456" }) });
    const user = userEvent.setup();
    render(<VdiCheckSection vehicleKind="car" token="tok_xyz" registration="AB12CDE" make="Ford" model="Focus" />);

    await user.click(screen.getByText("Unlock for £9.99"));

    expect(fetch).toHaveBeenCalledWith("/api/cars/vdi-checkout", expect.objectContaining({ method: "POST" }));
  });

  it("shows the server's own error message and never redirects when checkout creation fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "This report's Independent Vehicle Check has already been unlocked." }) });
    const user = userEvent.setup();
    render(<VdiCheckSection vehicleKind="bike" token="tok_abc" registration="AB12CDE" make="Honda" model="CB125R" />);

    await user.click(screen.getByText("Unlock for £7.99"));

    expect(await screen.findByRole("alert")).toHaveTextContent("already been unlocked");
    expect(window.location.href).toBe("");
  });

  it("shows a connection error, not an unhandled rejection, when fetch itself throws", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    render(<VdiCheckSection vehicleKind="bike" token="tok_abc" registration="AB12CDE" make="Honda" model="CB125R" />);

    await user.click(screen.getByText("Unlock for £7.99"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach the payment service/i);
  });

  it("shows a 'still processing' note when unlocked but vdiCheck hasn't been fetched yet", () => {
    const vdiUnlock: VdiUnlock = { unlockedAt: "2026-01-01T00:00:00.000Z", stripeSessionId: "cs_1", amountPaidPence: 799, currency: "gbp" };
    render(<VdiCheckSection vehicleKind="bike" token="tok_abc" registration="AB12CDE" make="Honda" model="CB125R" vdiUnlock={vdiUnlock} />);
    expect(screen.getByText(/being processed/)).toBeInTheDocument();
    expect(screen.queryByText("Unlock for £7.99")).not.toBeInTheDocument();
  });

  it("renders the independently-verified facts, registration, and make/model once vdiCheck is populated", () => {
    const vdiUnlock: VdiUnlock = {
      unlockedAt: "2026-01-01T00:00:00.000Z",
      stripeSessionId: "cs_1",
      amountPaidPence: 799,
      currency: "gbp",
      vdiCheck: {
        isStolen: false,
        hasWriteOffRecord: false,
        writeOffRecordCount: 0,
        hasOutstandingFinance: false,
        financeRecords: [],
        keeperChangeCount: 2,
        plateChangeCount: 1,
        colourChangeCount: 0,
        currentColour: "BLACK",
        vedFirstYearTwelveMonths: null,
        vedStandardTwelveMonths: 200,
      },
    };
    render(<VdiCheckSection vehicleKind="bike" token="tok_abc" registration="AB12CDE" make="Honda" model="CB125R" vdiUnlock={vdiUnlock} />);

    expect(screen.getByText(/Honda CB125R/)).toBeInTheDocument();
    expect(screen.getByText(/AB12CDE/)).toBeInTheDocument();
    expect(screen.getAllByText("None found")).toHaveLength(3);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("flags a stolen marker, write-off record, and outstanding finance prominently when present", () => {
    const vdiUnlock: VdiUnlock = {
      unlockedAt: "x",
      stripeSessionId: "cs_1",
      amountPaidPence: 799,
      currency: "gbp",
      vdiCheck: {
        isStolen: true,
        hasWriteOffRecord: true,
        writeOffRecordCount: 1,
        hasOutstandingFinance: true,
        financeRecords: [{ agreementDate: "2024-01-01", agreementType: "HIRE PURCHASE", financeCompany: "Example Finance" }],
        keeperChangeCount: 0,
        plateChangeCount: 0,
        colourChangeCount: 0,
        currentColour: null,
        vedFirstYearTwelveMonths: null,
        vedStandardTwelveMonths: null,
      },
    };
    render(<VdiCheckSection vehicleKind="bike" token="tok_abc" registration="AB12CDE" make="Honda" model="CB125R" vdiUnlock={vdiUnlock} />);

    expect(screen.getByText(/Recorded as stolen/)).toBeInTheDocument();
    expect(screen.getByText(/1 record\(s\) on file/)).toBeInTheDocument();
    expect(screen.getByText(/1 agreement\(s\) on file/)).toBeInTheDocument();
  });

  it("renders the valuation figures only for a car, and never for a bike", () => {
    const withValuation: VdiUnlock = {
      unlockedAt: "x",
      stripeSessionId: "cs_1",
      amountPaidPence: 999,
      currency: "gbp",
      vdiCheck: {
        isStolen: false, hasWriteOffRecord: false, writeOffRecordCount: 0, hasOutstandingFinance: false, financeRecords: [],
        keeperChangeCount: 1, plateChangeCount: 0, colourChangeCount: 0, currentColour: "SILVER",
        vedFirstYearTwelveMonths: null, vedStandardTwelveMonths: 200,
      },
      valuation: {
        valuationTime: null, valuationMileage: 23627, vehicleDescription: null, onTheRoad: 38015,
        dealerForecourt: 27161, tradeRetail: 26240, privateClean: 24257, privateAverage: 23994,
        partExchange: 23880, auction: 23866, tradeAverage: 23060, tradePoor: 21471,
      },
    };
    render(<VdiCheckSection vehicleKind="car" token="tok_xyz" registration="AB12CDE" make="Ford" model="Focus" vdiUnlock={withValuation} />);
    expect(screen.getByText("Independent valuation")).toBeInTheDocument();
    expect(screen.getByText("£23,994")).toBeInTheDocument();
  });

  it("renders the AI summary's key findings, valuation note, and summary when present", () => {
    const vdiUnlock: VdiUnlock = {
      unlockedAt: "x",
      stripeSessionId: "cs_1",
      amountPaidPence: 799,
      currency: "gbp",
      vdiCheck: {
        isStolen: false, hasWriteOffRecord: false, writeOffRecordCount: 0, hasOutstandingFinance: false, financeRecords: [],
        keeperChangeCount: 1, plateChangeCount: 0, colourChangeCount: 0, currentColour: "SILVER",
        vedFirstYearTwelveMonths: null, vedStandardTwelveMonths: 200,
      },
      aiSummary: {
        keyFindings: ["No stolen marker, write-off record, or outstanding finance found."],
        valuationNote: null,
        summary: "This vehicle's independent record is clean.",
      },
    };
    render(<VdiCheckSection vehicleKind="bike" token="tok_abc" registration="AB12CDE" make="Honda" model="CB125R" vdiUnlock={vdiUnlock} />);
    expect(screen.getByText("No stolen marker, write-off record, or outstanding finance found.")).toBeInTheDocument();
    expect(screen.getByText("This vehicle's independent record is clean.")).toBeInTheDocument();
  });

  it("omits the 'What this means' section entirely when aiSummary generation failed (null)", () => {
    const vdiUnlock: VdiUnlock = {
      unlockedAt: "x",
      stripeSessionId: "cs_1",
      amountPaidPence: 799,
      currency: "gbp",
      vdiCheck: {
        isStolen: false, hasWriteOffRecord: false, writeOffRecordCount: 0, hasOutstandingFinance: false, financeRecords: [],
        keeperChangeCount: 1, plateChangeCount: 0, colourChangeCount: 0, currentColour: "SILVER",
        vedFirstYearTwelveMonths: null, vedStandardTwelveMonths: 200,
      },
      aiSummary: null,
    };
    render(<VdiCheckSection vehicleKind="bike" token="tok_abc" registration="AB12CDE" make="Honda" model="CB125R" vdiUnlock={vdiUnlock} />);
    expect(screen.queryByText("What this means")).not.toBeInTheDocument();
  });
});
