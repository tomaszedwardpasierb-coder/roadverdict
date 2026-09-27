import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useApi } from '@/lib/use-api';

export type VehicleKind = 'bike' | 'car';

// Everything is stored in GBP and miles; these let the app convert what
// the person typed exactly as the website's own forms do.
export type VehicleUnits = {
  distanceUnit: 'mi' | 'km';
  currency: string;
  currencySymbol: string;
  rateFromGbp: number;
  kmPerMile: number;
  currentMileageDisplay: number;
};

export type GarageVehicle = {
  kind: VehicleKind;
  id: string;
  name: string;
  makeModel: string;
  registration: string | null;
  readOnly: boolean;
  fuelType: 'petrol' | 'diesel' | 'hybrid' | 'phev' | 'electric' | null;
  units: VehicleUnits;
};

// The website's tracker routes act on the vehicle its cookie selects;
// the app names the one it means in a header instead.
export function vehicleHeaders(vehicle: GarageVehicle): Record<string, string> {
  return vehicle.kind === 'bike' ? { 'X-RV-Bike-Id': vehicle.id } : { 'X-RV-Car-Id': vehicle.id };
}

export function toStoredMiles(display: number, units: VehicleUnits): number {
  return units.distanceUnit === 'km' ? display / units.kmPerMile : display;
}

export function toStoredGbp(display: number, units: VehicleUnits): number {
  return Math.round((display / units.rateFromGbp) * 100) / 100;
}

type Garage = { vehicles: GarageVehicle[]; defaultVehicle: { kind: VehicleKind; id: string } | null };

type VehicleContextValue = {
  vehicles: GarageVehicle[];
  selected: GarageVehicle | null;
  select: (vehicle: GarageVehicle) => void;
  loading: boolean;
  error: string | null;
  retry: () => void;
  // Reload the garage quietly - after a save that may have moved a
  // vehicle's current mileage.
  refresh: () => void;
};

// The website remembers the selected vehicle in a cookie; the app keeps
// its own choice on the phone, so switching here never changes what the
// website shows (and the other way round).
const SELECTED_KEY = 'rv.selectedVehicle';

const VehicleContext = createContext<VehicleContextValue | null>(null);

export function VehicleProvider({ children }: { children: ReactNode }) {
  const garage = useApi<Garage>('/api/app/garage');
  const [savedChoice, setSavedChoice] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    SecureStore.getItemAsync(SELECTED_KEY)
      .then((v) => setSavedChoice(v))
      .catch(() => setSavedChoice(null));
  }, []);

  // Vehicles still owned first; transferred (read-only) ones after.
  const vehicles = useMemo(() => [...(garage.data?.vehicles ?? [])].sort((a, b) => Number(a.readOnly) - Number(b.readOnly)), [garage.data]);

  const selected = useMemo(() => {
    if (vehicles.length === 0) return null;
    const byKey = (key: string | null | undefined) => vehicles.find((v) => `${v.kind}:${v.id}` === key);
    const saved = byKey(savedChoice);
    if (saved) return saved;
    // With no choice made yet, start on a vehicle the person still owns:
    // the website's default is simply the oldest, which may be one
    // they've since sold (read-only).
    const fallback = garage.data?.defaultVehicle;
    const suggested = fallback ? byKey(`${fallback.kind}:${fallback.id}`) : undefined;
    if (suggested && !suggested.readOnly) return suggested;
    return vehicles.find((v) => !v.readOnly) ?? suggested ?? vehicles[0];
  }, [vehicles, savedChoice, garage.data]);

  const select = useCallback((vehicle: GarageVehicle) => {
    const key = `${vehicle.kind}:${vehicle.id}`;
    setSavedChoice(key);
    SecureStore.setItemAsync(SELECTED_KEY, key).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      vehicles,
      selected,
      select,
      loading: garage.loading || savedChoice === undefined,
      error: garage.error,
      retry: garage.retry,
      refresh: garage.refresh,
    }),
    [vehicles, selected, select, garage.loading, garage.error, garage.retry, garage.refresh, savedChoice]
  );

  return <VehicleContext.Provider value={value}>{children}</VehicleContext.Provider>;
}

export function useVehicle(): VehicleContextValue {
  const value = useContext(VehicleContext);
  if (!value) throw new Error('useVehicle must be used inside <VehicleProvider>.');
  return value;
}
