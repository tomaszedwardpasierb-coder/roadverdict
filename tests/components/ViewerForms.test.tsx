// Place at: tests/components/ViewerForms.test.tsx
//
// The real forms have their own suites (QuoteForm.test.tsx etc.) - these
// only check the wiring between the client-side viewer lookup and each
// form's props, so the forms are stubbed to record what they were given.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/components/QuoteForm", () => ({
  QuoteForm: (p: { signedIn: boolean; initialBrand?: string; initialBikeClass?: string }) => (
    <div data-testid="quote">{JSON.stringify(p)}</div>
  ),
}));
vi.mock("@/components/CarQuoteForm", () => ({
  CarQuoteForm: (p: { signedIn: boolean; initialBrand?: string; initialCarClass?: string }) => (
    <div data-testid="car-quote">{JSON.stringify(p)}</div>
  ),
}));
vi.mock("@/components/CostCalculatorForm", () => ({
  CostCalculatorForm: (p: Record<string, unknown>) => <div data-testid="cost">{JSON.stringify(p)}</div>,
}));
vi.mock("@/components/CarCostCalculatorForm", () => ({
  CarCostCalculatorForm: (p: Record<string, unknown>) => <div data-testid="car-cost">{JSON.stringify(p)}</div>,
}));
vi.mock("@/components/BuyingGuideForm", () => ({
  BuyingGuideForm: (p: Record<string, unknown>) => <div data-testid="guide">{JSON.stringify(p)}</div>,
}));
vi.mock("@/components/CarBuyingGuideForm", () => ({
  CarBuyingGuideForm: (p: Record<string, unknown>) => <div data-testid="car-guide">{JSON.stringify(p)}</div>,
}));

import {
  BuyingGuideFormForViewer,
  CarBuyingGuideFormForViewer,
  CarCostCalculatorFormForViewer,
  CarQuoteFormForViewer,
  CostCalculatorFormForViewer,
  QuoteFormForViewer,
} from "@/components/viewer/ViewerForms";

let fakeNow = 5_000_000;

function setAuthMarker(on: boolean) {
  document.cookie = on ? "rv_auth=1; path=/" : "rv_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
}

const signedInViewer = {
  signedIn: true,
  hasBike: true,
  hasCar: true,
  bike: { brand: "yamaha", bikeClass: "medium", model: "MT-07" },
  car: { brand: "bmw", carClass: "large" },
};

describe("form wrappers", () => {
  beforeEach(() => {
    fakeNow += 60_000;
    vi.spyOn(Date, "now").mockReturnValue(fakeNow);
    setAuthMarker(false);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setAuthMarker(false);
  });

  it("gives an anonymous visitor the plain signed-out form and never calls the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<QuoteFormForViewer />);

    expect(JSON.parse(screen.getByTestId("quote").textContent!)).toEqual({ signedIn: false });
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prefills the bike quote form from the signed-in visitor's own bike", async () => {
    setAuthMarker(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => signedInViewer }));
    render(<QuoteFormForViewer />);

    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId("quote").textContent!)).toEqual({ signedIn: true, initialBrand: "yamaha", initialBikeClass: "medium" })
    );
  });

  it("prefills the car quote form from the visitor's car, not their bike", async () => {
    setAuthMarker(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => signedInViewer }));
    render(<CarQuoteFormForViewer />);

    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId("car-quote").textContent!)).toEqual({ signedIn: true, initialBrand: "bmw", initialCarClass: "large" })
    );
  });

  it("prefills the bike cost calculator including the matched model", async () => {
    setAuthMarker(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => signedInViewer }));
    render(<CostCalculatorFormForViewer />);

    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId("cost").textContent!)).toEqual({
        signedIn: true,
        initialBrand: "yamaha",
        initialModel: "MT-07",
        initialBikeClass: "medium",
      })
    );
  });

  it("prefills the car cost calculator", async () => {
    setAuthMarker(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => signedInViewer }));
    render(<CarCostCalculatorFormForViewer />);

    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId("car-cost").textContent!)).toEqual({ signedIn: true, initialBrand: "bmw", initialCarClass: "large" })
    );
  });

  it("passes only signedIn to both buying-guide forms, which take no prefill", async () => {
    setAuthMarker(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => signedInViewer }));
    render(
      <>
        <BuyingGuideFormForViewer />
        <CarBuyingGuideFormForViewer />
      </>
    );

    await waitFor(() => expect(JSON.parse(screen.getByTestId("guide").textContent!)).toEqual({ signedIn: true }));
    expect(JSON.parse(screen.getByTestId("car-guide").textContent!)).toEqual({ signedIn: true });
  });

  it("a signed-in visitor with no vehicle gets signedIn true and no prefill", async () => {
    setAuthMarker(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ signedIn: true, hasBike: false, hasCar: false }) }));
    render(<QuoteFormForViewer />);

    await waitFor(() => expect(JSON.parse(screen.getByTestId("quote").textContent!)).toEqual({ signedIn: true }));
  });
});
