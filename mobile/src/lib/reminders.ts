import type { GarageVehicle } from '@/lib/vehicle';

// The web's own reminder routes - one per vehicle kind. The app names
// which vehicle it means with vehicleHeaders().
export function reminderRoute(vehicle: GarageVehicle, id?: string): string {
  const base = vehicle.kind === 'bike' ? '/api/tracker/reminders' : '/api/cars/car-reminders';
  return id ? `${base}/${encodeURIComponent(id)}` : base;
}
