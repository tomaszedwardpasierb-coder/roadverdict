// Place at: src/lib/tracker/carReportAccess.ts
//
// Car equivalent of reportAccess.ts - but only allKnownCarPlates and
// verifyCarPlate actually need a car-specific version. hasReportAccess/
// grantReportAccess/checkPlateRateLimit/recordPlateAttempt/normalizePlate
// are reused directly from reportAccess.ts at every car-report call site
// - all four are already genuinely vehicle-neutral (keyed purely by the
// shareToken string, which is a globally unique random value regardless
// of which kind of share link it came from), so duplicating them here
// would be pure boilerplate with zero behavioural difference.
import { getCarById, type CarDoc } from "@/lib/tracker/car";
import { resolveCarShareToken } from "@/lib/tracker/carShareLink";
import { normalizePlate } from "@/lib/tracker/reportAccess";

// Every registration the car has ever held, not just the current one -
// mirrors reportAccess.ts's own allKnownPlates exactly.
export function allKnownCarPlates(car: CarDoc): string[] {
  const plates = new Set<string>();
  if (car.originalRegistration) plates.add(normalizePlate(car.originalRegistration));
  for (const change of car.registrationChanges ?? []) plates.add(normalizePlate(change.plate));
  return [...plates];
}

export async function verifyCarPlate(shareToken: string, submittedPlate: string): Promise<boolean> {
  const resolved = await resolveCarShareToken(shareToken);
  if (!resolved) return false;
  const car = await getCarById(resolved.email, resolved.carId);
  if (!car) return false;
  const known = allKnownCarPlates(car);
  if (known.length === 0) return false;
  return known.includes(normalizePlate(submittedPlate));
}
