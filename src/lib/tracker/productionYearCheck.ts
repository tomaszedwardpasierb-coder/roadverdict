// Place at: src/lib/tracker/productionYearCheck.ts
//
// Whether a claimed expense date falls before the bike's production year
// even started. No check is possible (or meaningful) for a custom build,
// or a bike with no recorded production year - both simply return false.

export interface ProductionYearCheckable {
  year?: number;
  isCustomBuild?: boolean;
}

// Jan 1 of the production year, not some later point in it - the most
// lenient reasonable cutoff, since a bike could genuinely have been
// available anywhere from January onward in its production year.
export function isBeforeProduction(dateStr: string, bike: ProductionYearCheckable): boolean {
  if (bike.isCustomBuild || !bike.year) return false;
  return new Date(dateStr) < new Date(`${bike.year}-01-01`);
}
