// Place at: tests/components/MpgCalculator.test.tsx
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MpgCalculator } from "@/components/MpgCalculator";
import { ActiveSectionProvider, useActiveSection } from "@/components/ActiveSectionContext";
import type { MpgCalculatorAssistantContext } from "@/lib/fuelEconomy";

function ObserveMpgCalculator({ onChange }: { onChange: (value: MpgCalculatorAssistantContext | null) => void }) {
  const { mpgCalculator } = useActiveSection();
  useEffect(() => onChange(mpgCalculator), [mpgCalculator, onChange]);
  return null;
}

const UK_PRICES = {
  petrol: { pencePerLitre: 133.19, weekCommencing: "22/09/2026" },
  diesel: { pencePerLitre: 139.46, weekCommencing: "22/09/2026" },
  source: "DESNZ weekly road fuel prices",
  sourceUrl: "https://www.gov.uk/government/statistics/weekly-road-fuel-prices",
};

describe("MpgCalculator", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => UK_PRICES }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("works out MPG live from miles and litres, with L/100km and US mpg alongside", async () => {
    const user = userEvent.setup();
    render(<MpgCalculator />);
    expect(screen.getByText(/Enter the miles and the litres/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Miles driven"), "400");
    await user.type(screen.getByLabelText("Litres used"), "40");
    expect(screen.getByText("45.5")).toBeInTheDocument();
    expect(screen.getByText(/6\.2 L\/100km · 37\.9 US mpg/)).toBeInTheDocument();
  });

  it("switching to L/100km turns the miles typed into kilometres instead of losing them", async () => {
    const user = userEvent.setup();
    render(<MpgCalculator />);
    await user.type(screen.getByLabelText("Miles driven"), "100");
    await user.type(screen.getByLabelText("Litres used"), "10");
    await user.click(screen.getByLabelText("L/100km"));
    expect(screen.getByLabelText("Kilometres driven")).toHaveValue("160.9");
    expect(screen.getByText("6.2")).toBeInTheDocument();
    expect(screen.getByText(/45\.5 mpg \(UK\)/)).toBeInTheDocument();
  });

  it("starts from this week's UK petrol average, offers diesel, and prices the mile and the tank", async () => {
    const user = userEvent.setup();
    render(<MpgCalculator />);
    await waitFor(() => expect(screen.getByLabelText("Price per litre (pence)")).toHaveValue("133.2"));
    expect(fetch).toHaveBeenCalledWith("/api/fuel-price");
    expect(screen.getByText(/Week of 22 Sept 2026/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Miles driven"), "300");
    await user.type(screen.getByLabelText("Litres used"), "40");
    await user.click(screen.getByRole("button", { name: "Diesel 139.5p" }));
    // 139.5p a litre, 40 litres over 300 miles.
    expect(screen.getByText("18.6p")).toBeInTheDocument();
    expect(screen.getByText("£55.80")).toBeInTheDocument();
  });

  it("never lets a late UK average replace a price the owner already has", async () => {
    render(<MpgCalculator variant="embedded" initialTank={{ miles: 212, litres: 18.4 }} initialPrice={{ perLitre: 1.489, label: "Your last fill-up, 12 Sept." }} />);
    expect(screen.getByLabelText("Miles driven")).toHaveValue("212");
    expect(screen.getByLabelText("Litres used")).toHaveValue("18.4");
    await waitFor(() => expect(screen.getByRole("button", { name: "Petrol 133.2p" })).toBeInTheDocument());
    expect(screen.getByLabelText("Price per litre (pence)")).toHaveValue("148.9");
    expect(screen.getByText("Your last fill-up, 12 Sept.")).toBeInTheDocument();
  });

  it("asks a non-UK owner for a price in their own money, and doesn't offer UK averages", () => {
    render(<MpgCalculator variant="embedded" currency="EUR" />);
    expect(screen.getByLabelText("Price per litre (€)")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("publishes the live page calculator values for the assistant", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ActiveSectionProvider>
        <MpgCalculator />
        <ObserveMpgCalculator onChange={onChange} />
      </ActiveSectionProvider>
    );

    await user.type(screen.getByLabelText("Miles driven"), "400");
    await user.type(screen.getByLabelText("Litres used"), "40");
    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
        unit: "mpg",
        distance: 400,
        litres: 40,
        currency: "GBP",
        pricePerLitre: expect.any(Number),
      }));
    });
  });
});
