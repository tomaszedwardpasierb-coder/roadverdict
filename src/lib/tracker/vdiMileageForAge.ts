// Place at: src/lib/tracker/vdiMileageForAge.ts
//
// The history check's AverageMileageForAge is the TOTAL mileage typical
// for a vehicle of that age (12,000 a year times its whole years - 228,000
// for a 19-year-old car), not a yearly figure. Shown next to the vehicle's
// own yearly average as if it were one, it read "2,699 a year; 228,000 is
// typical". Turned into a yearly figure when the age is known, so the two
// compare like for like.
export function typicalAnnualMileage(
  v: { averageMileageForAge: number | null; dateFirstRegisteredInUk?: string | null; dateOfManufacture?: string | null },
  now: Date = new Date()
): number | null {
  if (v.averageMileageForAge == null) return null;
  const from = v.dateFirstRegisteredInUk ?? v.dateOfManufacture;
  const start = from ? new Date(from) : null;
  if (!start || Number.isNaN(start.getTime())) return null;
  let years = now.getUTCFullYear() - start.getUTCFullYear();
  const beforeAnniversary =
    now.getUTCMonth() < start.getUTCMonth() || (now.getUTCMonth() === start.getUTCMonth() && now.getUTCDate() < start.getUTCDate());
  if (beforeAnniversary) years--;
  if (years < 1) return null;
  return Math.round(v.averageMileageForAge / years / 100) * 100;
}

// "about 12,000 miles a year typical", or the total when the age isn't known.
export function typicalMileageText(
  v: { averageMileageForAge: number | null; dateFirstRegisteredInUk?: string | null; dateOfManufacture?: string | null },
  now: Date = new Date()
): string | null {
  if (v.averageMileageForAge == null) return null;
  const perYear = typicalAnnualMileage(v, now);
  return perYear != null
    ? `about ${perYear.toLocaleString("en-GB")} miles a year is typical for its age`
    : `about ${Math.round(v.averageMileageForAge).toLocaleString("en-GB")} miles in total is typical for its age`;
}
