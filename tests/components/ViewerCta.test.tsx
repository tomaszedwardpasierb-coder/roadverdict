// Place at: tests/components/ViewerCta.test.tsx
//
// The public /motorcycles and /cars pages are static, so the signed-in
// variants of their CTAs are resolved client-side - these cover the
// behaviour those pages' server-side tests used to cover (see
// MotorcyclesPage.test.tsx / CarsPage.test.tsx).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ViewerCtaLink, ViewerSwitchKindLink } from "@/components/viewer/ViewerCta";

let fakeNow = 1_000_000;

function setAuthMarker(on: boolean) {
  document.cookie = on ? "rv_auth=1; path=/" : "rv_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
}

function mockViewer(body: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, json: async () => body });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("ViewerCtaLink / ViewerSwitchKindLink", () => {
  beforeEach(() => {
    // useViewer shares one in-flight request for a few seconds; move the
    // clock past that window between tests so none reuses another's answer.
    fakeNow += 60_000;
    vi.spyOn(Date, "now").mockReturnValue(fakeNow);
    setAuthMarker(false);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setAuthMarker(false);
  });

  it("renders the signed-out CTA and makes NO network request for an anonymous visitor", async () => {
    const fetchMock = mockViewer({});
    render(<ViewerCtaLink kind="bike" className="cta" />);

    const link = screen.getByRole("link", { name: "Start tracking your bike free" });
    expect(link).toHaveAttribute("href", "/login?redirect=%2Fdashboard%3FaddVehicle%3Dbike");
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("points a signed-in visitor with no bike at the add-bike flow", async () => {
    setAuthMarker(true);
    mockViewer({ signedIn: true, hasBike: false, hasCar: true });
    render(<ViewerCtaLink kind="bike" className="cta" />);

    const link = await screen.findByRole("link", { name: "Add your bike" });
    expect(link).toHaveAttribute("href", "/dashboard?addVehicle=bike");
  });

  it("points a signed-in visitor who already has a bike at the dashboard, still forcing the bike view", async () => {
    setAuthMarker(true);
    mockViewer({ signedIn: true, hasBike: true, hasCar: false });
    render(<ViewerCtaLink kind="bike" className="cta" />);

    const link = await screen.findByRole("link", { name: "Go to your dashboard" });
    // Not just "/dashboard" - someone with both a bike and a car needs
    // addVehicle preserved, or the dashboard falls back to whatever kind
    // their activeVehicleKind cookie remembers.
    expect(link).toHaveAttribute("href", "/dashboard?addVehicle=bike");
  });

  it("does the same for cars, keyed on hasCar not hasBike", async () => {
    setAuthMarker(true);
    mockViewer({ signedIn: true, hasBike: true, hasCar: false });
    render(<ViewerCtaLink kind="car" className="cta" />);

    const link = await screen.findByRole("link", { name: "Add your car" });
    expect(link).toHaveAttribute("href", "/dashboard?addVehicle=car");
  });

  it("keeps the extra children (the hero arrow icon) alongside the label", () => {
    render(
      <ViewerCtaLink kind="car" className="cta">
        <svg data-testid="arrow" />
      </ViewerCtaLink>
    );
    expect(screen.getByRole("link", { name: /start tracking your car free/i })).toContainElement(screen.getByTestId("arrow"));
  });

  it("falls back to the signed-out CTA if the viewer request fails", async () => {
    setAuthMarker(true);
    mockViewer({}, false);
    render(<ViewerCtaLink kind="bike" className="cta" />);

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: "Start tracking your bike free" })).toBeInTheDocument();
  });

  it("switch-kind link goes to the public hub for the other vehicle when signed out", () => {
    render(<ViewerSwitchKindLink target="car" className="s">Drive a car instead?</ViewerSwitchKindLink>);
    expect(screen.getByRole("link", { name: "Drive a car instead?" })).toHaveAttribute("href", "/cars");
  });

  it("switch-kind link forces the other vehicle's view when signed in (plain / would bounce back to the remembered kind)", async () => {
    setAuthMarker(true);
    mockViewer({ signedIn: true, hasBike: true, hasCar: true });
    render(<ViewerSwitchKindLink target="bike" className="s">Ride a motorcycle instead?</ViewerSwitchKindLink>);

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Ride a motorcycle instead?" })).toHaveAttribute("href", "/dashboard?addVehicle=bike")
    );
  });

  it("several components on one page share a single viewer request", async () => {
    setAuthMarker(true);
    const fetchMock = mockViewer({ signedIn: true, hasBike: true, hasCar: false });
    render(
      <>
        <ViewerCtaLink kind="bike" className="a" />
        <ViewerCtaLink kind="bike" className="b" />
        <ViewerSwitchKindLink target="car" className="c">Switch</ViewerSwitchKindLink>
      </>
    );

    await waitFor(() => expect(screen.getAllByRole("link", { name: "Go to your dashboard" })).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
