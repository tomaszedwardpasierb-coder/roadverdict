// Place at: src/lib/app/vehicleOptions.ts
//
// What the Android app's "Add a vehicle" screen offers: the same curated
// make and model lists, car fuel types and regions the web's AddBikeForm
// and AddCarForm use - so a registration looked up in the app is matched
// against exactly the names the website would match it against. Also the
// currencies its Settings offer, as the web's UnitSettings does.
import { ALL_BRANDS, MOTORCYCLE_MODELS } from "@/lib/motorcycleModels";
import { ALL_CAR_BRANDS, CAR_MODELS } from "@/lib/carModels";
import { REGION_LABELS, type Region } from "@/lib/priceData";
import type { CarFuelType } from "@/lib/tracker/car";
import { ALL_CURRENCIES, CURRENCY_LABELS, type Currency } from "@/lib/tracker/currency";

// The wording AddCarForm's fuel type dropdown uses.
const CAR_FUEL_TYPE_LABELS: Record<CarFuelType, string> = {
  petrol: "Petrol",
  diesel: "Diesel",
  hybrid: "Hybrid",
  phev: "Plug-in hybrid (PHEV)",
  electric: "Electric",
};

export type VehicleOptions = {
  bike: { makes: string[]; models: { make: string; model: string; engineCC: number }[] };
  car: { makes: string[]; models: { make: string; model: string }[]; fuelTypes: { value: CarFuelType; label: string }[] };
  regions: { value: Region; label: string }[];
  // The web forms' starting choice.
  defaultRegion: Region;
  // A vehicle's display currency, as the web's unit settings offer it.
  currencies: { value: Currency; label: string }[];
};

export function getVehicleOptions(): VehicleOptions {
  return {
    bike: {
      makes: ALL_BRANDS,
      models: MOTORCYCLE_MODELS.map(({ make, model, engineCC }) => ({ make, model, engineCC })),
    },
    car: {
      makes: ALL_CAR_BRANDS,
      models: CAR_MODELS.map(({ make, model }) => ({ make, model })),
      fuelTypes: (Object.keys(CAR_FUEL_TYPE_LABELS) as CarFuelType[]).map((value) => ({ value, label: CAR_FUEL_TYPE_LABELS[value] })),
    },
    regions: (Object.keys(REGION_LABELS) as Region[]).map((value) => ({ value, label: REGION_LABELS[value] })),
    defaultRegion: "rest-england-wales",
    currencies: ALL_CURRENCIES.map((value) => ({ value, label: CURRENCY_LABELS[value] })),
  };
}
