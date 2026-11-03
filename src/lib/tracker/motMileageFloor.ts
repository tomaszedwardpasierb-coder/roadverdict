// Place at: src/lib/tracker/motMileageFloor.ts
//
// A vehicle's mileage can't be below the odometer reading at its latest
// MOT - the floor the add-vehicle form sets. The MOT import applies it
// again to the saved vehicle, which catches a reading typed in while the
// form couldn't fetch that floor (a "2" for a car DVSA saw at 43,851).
import type { ParsedMotTest } from "./motHistory";

export interface MotReading {
  miles: number;
  date: string; // YYYY-MM-DD
}

// tests oldest first, as parseMotHistory returns them; a null mileage is
// a reading DVSA didn't confirm.
export function latestMotReading(tests: ParsedMotTest[]): MotReading | null {
  for (let i = tests.length - 1; i >= 0; i--) {
    const miles = tests[i].mileage;
    if (miles !== null) return { miles, date: tests[i].testDate.slice(0, 10) };
  }
  return null;
}

// Raises the current mileage to the reading, and the starting mileage too
// when that MOT came before the vehicle was added - a starting reading
// below it can't be right. Returns whether anything changed.
export function raiseMileageToMotReading(
  vehicle: { currentMileage: number; startingMileage: number; dateAdded: string },
  reading: MotReading
): boolean {
  let changed = false;
  if (vehicle.currentMileage < reading.miles) {
    vehicle.currentMileage = reading.miles;
    changed = true;
  }
  if (vehicle.startingMileage < reading.miles && reading.date <= vehicle.dateAdded.slice(0, 10)) {
    vehicle.startingMileage = reading.miles;
    changed = true;
  }
  return changed;
}
