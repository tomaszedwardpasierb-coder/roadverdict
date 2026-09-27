// The quote checker's and cost calculator's choices for the selected
// vehicle, and where they start for it (see /api/app/tools on the server).
import { useApi } from '@/lib/use-api';
import { useVehicle } from '@/lib/vehicle';

export type Option = { value: string; label: string };
export type Verdict = 'fair' | 'high' | 'second-opinion';

export type ToolsScreen = {
  kind: 'bike' | 'car';
  options: { brands: Option[]; classes: Option[]; jobs: Option[]; regions: Option[]; fuels: Option[] };
  defaults: { brand: string; vehicleClass: string; region: string; fuel: string | null };
  // A fully electric car - the cost calculator can't price one yet.
  electric: boolean;
  verdicts: Record<Verdict, { label: string; summary: string }>;
  partsLinks: Record<string, { label: string; href: string }[]>;
};

export function useToolsScreen() {
  const { selected } = useVehicle();
  const screen = useApi<ToolsScreen>(selected ? `/api/app/tools?kind=${selected.kind}&id=${encodeURIComponent(selected.id)}` : null);
  return { selected, screen };
}
