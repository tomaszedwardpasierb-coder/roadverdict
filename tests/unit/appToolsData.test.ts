import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getBike: vi.fn(), getCarById: vi.fn() }));

vi.mock("@/lib/tracker/bike", () => ({ getBike: mocks.getBike }));
vi.mock("@/lib/tracker/car", () => ({ getCarById: mocks.getCarById }));

import { getToolsScreen } from "@/lib/app/toolsData";
import { JOB_LABELS } from "@/lib/priceData";
import { CAR_JOB_LABELS_BENCHMARKED } from "@/lib/carPriceData";

const email = "rider@example.com";

beforeEach(() => {
  mocks.getBike.mockReset().mockResolvedValue(null);
  mocks.getCarById.mockReset().mockResolvedValue(null);
});

describe("getToolsScreen", () => {
  it("returns null for a vehicle that isn't on this account", async () => {
    expect(await getToolsScreen(email, "bike", "not-mine")).toBeNull();
    expect(await getToolsScreen(email, "car", "not-mine")).toBeNull();
  });

  it("starts a bike's check from the bike itself, with the web form's lists", async () => {
    mocks.getBike.mockResolvedValue({ id: "b1", make: "Honda", model: "CB500F", engineCC: 471, region: "london-se" });
    const screen = (await getToolsScreen(email, "bike", "b1"))!;
    expect(screen.kind).toBe("bike");
    expect(screen.defaults).toMatchObject({ brand: "honda", region: "london-se" });
    expect(screen.options.jobs.map((j) => j.value)).toEqual(Object.keys(JOB_LABELS));
    expect(screen.options.brands.some((b) => b.value === "honda")).toBe(true);
  });

  it("uses the web form's default region when a bike has none", async () => {
    mocks.getBike.mockResolvedValue({ id: "b1", make: "Honda", model: "CB500F", engineCC: 471 });
    expect((await getToolsScreen(email, "bike", "b1"))!.defaults.region).toBe("rest-england-wales");
  });

  it("offers a bike's parts at Sportsbikeshop for jobs that have parts, and only those", async () => {
    mocks.getBike.mockResolvedValue({ id: "b1", make: "Honda", model: "CB500F", engineCC: 471 });
    const { partsLinks } = (await getToolsScreen(email, "bike", "b1"))!;
    expect(partsLinks["brake-pads-front"]?.[0].href).toMatch(/sportsbikeshop\.co\.uk.*#\/28990,/);
    for (const links of Object.values(partsLinks)) expect(links.length).toBeGreaterThan(0);
  });

  it("gives a car the car lists, no parts links, and a verdict that talks about cars", async () => {
    mocks.getCarById.mockResolvedValue({ id: "c1", make: "BMW", model: "320d", fuelType: "diesel", engineLitres: 2.0 });
    const screen = (await getToolsScreen(email, "car", "c1"))!;
    expect(screen.options.jobs.map((j) => j.value)).toEqual(Object.keys(CAR_JOB_LABELS_BENCHMARKED));
    expect(screen.defaults).toMatchObject({ vehicleClass: "medium", region: "rest-england-wales" });
    expect(screen.partsLinks).toEqual({});
    for (const v of Object.values(screen.verdicts)) expect(v.summary).not.toMatch(/\bbike\b/);
    expect(screen.verdicts.fair.summary).toMatch(/\bcar\b/);
  });

  it("starts an electric car on the web form's default size, and says the calculator can't price it", async () => {
    mocks.getCarById.mockResolvedValue({ id: "c1", make: "Tesla", model: "Model 3", fuelType: "electric" });
    const screen = (await getToolsScreen(email, "car", "c1"))!;
    expect(screen.defaults).toMatchObject({ vehicleClass: "medium", fuel: "petrol" });
    expect(screen.electric).toBe(true);
  });

  it("offers a car the fuels the cost calculator prices, starting from the car's own", async () => {
    mocks.getCarById.mockResolvedValue({ id: "c1", make: "BMW", model: "320d", fuelType: "diesel", engineLitres: 2.0 });
    const screen = (await getToolsScreen(email, "car", "c1"))!;
    expect(screen.options.fuels.map((f) => f.value)).toEqual(["petrol", "diesel", "hybrid", "phev"]);
    expect(screen.defaults.fuel).toBe("diesel");
    expect(screen.electric).toBe(false);
  });

  it("gives a bike no fuel choice", async () => {
    mocks.getBike.mockResolvedValue({ id: "b1", make: "Honda", model: "CB500F", engineCC: 471 });
    const screen = (await getToolsScreen(email, "bike", "b1"))!;
    expect(screen.options.fuels).toEqual([]);
    expect(screen.defaults.fuel).toBeNull();
  });
});
