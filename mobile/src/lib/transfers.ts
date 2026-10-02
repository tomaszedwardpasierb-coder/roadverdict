// Transfer ownership: the website's own handover routes. The list route
// answers with every pending request on the account, so the app keeps
// the selected vehicle's; offers go to the vehicle named in
// vehicleHeaders().
import type { GarageVehicle } from '@/lib/vehicle';

export type TransferRequest = {
  id: string;
  bikeId?: string;
  carId?: string;
  recipientEmail: string;
  // "owner": this account offered the vehicle to recipientEmail.
  // "recipient": recipientEmail asked this account for it.
  initiatedBy: 'owner' | 'recipient';
  createdAt: string;
  includeRecords?: boolean;
};

export function transfersRoute(vehicle: GarageVehicle): string {
  return vehicle.kind === 'bike' ? '/api/tracker/bike-transfer' : '/api/cars/car-transfer';
}

export function requestsForVehicle(requests: TransferRequest[], vehicle: GarageVehicle): TransferRequest[] {
  return requests.filter((r) => (vehicle.kind === 'bike' ? r.bikeId : r.carId) === vehicle.id);
}

// Answers someone who asked for the vehicle.
export function incomingRoute(vehicle: GarageVehicle, requestId: string, decision: 'approve' | 'decline'): string {
  return `${transfersRoute(vehicle)}/incoming/${encodeURIComponent(requestId)}/${decision}`;
}

export function recordsNote(includeRecords: boolean, noun: string): string {
  return includeRecords
    ? 'Your logged service records, fuel logs, mods, bills and any attached receipts go with it.'
    : `Your individual records stay private on your own account – only the ${noun}’s identity and a summary go with it.`;
}
