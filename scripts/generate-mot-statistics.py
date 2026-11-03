# Writes src/lib/mot/motStatistics.ts from DVSA's "MOT testing data for Great
# Britain" CSVs, so no figure on /mot-statistics is typed by hand.
#
#   python -I -X utf8 scripts/generate-mot-statistics.py <folder with the DVSA CSVs>
#
# Download the CSVs from
# https://www.gov.uk/government/statistical-data-sets/mot-testing-data-for-great-britain
# (dvsa-mot-01 to dvsa-mot-06). Every rate is recomputed from the counts and
# checked against DVSA's own percentage; a mismatch stops the script.
#
# Known problem in the 2025-26 release (published 10 Sep 2026): in
# dvsa-mot-01's 2025-26 Total, Q3 and Q4 rows the two "dangerous" count
# columns are rotated between classes (the motorcycle row carries the cars'
# count and vice versa; class 5 and class 7 likewise). The real per-class
# figures are recovered by that swap and confirmed against the
# defect-category tables (dvsa-mot-02 to 05), which agree with it.
import csv
import json
import os
import sys

D = sys.argv[1]
YEAR = "2025 to 2026"
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "lib", "mot", "motStatistics.ts")

CLASSES = {
    "Classes 1 & 2: Motorcycles": "motorcycles",
    "Classes 3 & 4: Cars, vans and passenger vehicles with up to 12 seats": "cars",
    "Class 5: Private passenger vehicles with more than 12 seats": "class5",
    "Class 7: Goods vehicles between 3,000 and 3,500 kg gross vehicle weight": "class7",
    "Total": "all",
}
# 2025-26 only: whose dangerous count each row really carries.
DANGEROUS_SWAP_2025_26 = {"motorcycles": "cars", "cars": "motorcycles", "class5": "class7", "class7": "class5", "all": "all"}


def rows(name):
    with open(os.path.join(D, name), encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def num(s):
    return int(s.replace(",", "")) if s.strip() else 0


def pct(s):
    s = s.strip().rstrip("%")
    return float(s) if s else None


results = [r for r in rows("dvsa-mot-01-mot-test-results-by-class-of-vehicle.csv") if r["Period"].strip() == "Total"]

# The year, by class: counts, plus the rates worked out from them.
by_class = {}
raw_dangerous = {}
for r in results:
    if r["Financial year"].strip() != YEAR:
        continue
    key = CLASSES[r["Class"].strip()]
    tests, fails, prs = num(r["Tests"]), num(r["Fails"]), num(r["Pass after rectification at MOT test station"])
    initial = round(100 * (fails + prs) / tests, 2)
    assert abs(initial - pct(r["Initial fail rate"])) < 0.006, (key, initial, r["Initial fail rate"])
    assert abs(round(100 * fails / tests, 2) - pct(r["Final fail rate"])) < 0.006, key
    raw_dangerous[key] = num(r["Tests failed with at least one dangerous item"])
    by_class[key] = {"tests": tests, "fails": fails, "passedAfterRectification": prs}
for key, row in by_class.items():
    row["testsWithDangerousDefect"] = raw_dangerous[DANGEROUS_SWAP_2025_26[key]]
assert sum(v["testsWithDangerousDefect"] for k, v in by_class.items() if k != "all") == by_class["all"]["testsWithDangerousDefect"]

# Thirteen years of first-time fail rates, from the counts.
trend = {}
for r in results:
    key = CLASSES[r["Class"].strip()]
    if key not in ("motorcycles", "cars"):
        continue
    tests, fails, prs = num(r["Tests"]), num(r["Fails"]), num(r["Pass after rectification at MOT test station"])
    if not tests:
        continue
    year = r["Financial year"].strip()
    if year == "2026 to 2027":  # a single quarter so far
        continue
    trend.setdefault(year, {})[key] = round(100 * (fails + prs) / tests, 2)
trend_list = [{"year": y, **v} for y, v in sorted(trend.items())]


def categories(name):
    out, overall, average = [], None, None
    for r in rows(name):
        if r["Financial year"].strip() != YEAR or r["Period"].strip() != "Total":
            continue
        item = {
            "category": r["Defect category"].strip(),
            "percentOfTests": pct(r["Overall % of tests"]),
            "percentOfDefects": pct(r["Overall % of defects"]),
            "dangerousPercentOfTests": pct(r["Dangerous defects % of tests"]),
        }
        name_lower = item["category"].lower()
        if name_lower == "overall initial failure rate":
            overall = item
        elif name_lower == "average defects per initial test failure":
            average = float(r["Overall % of defects"])
        elif item["percentOfTests"] is not None:  # a few categories are blank
            out.append(item)
    out.sort(key=lambda c: -c["percentOfTests"])
    return out, overall, average


car_categories, car_overall, car_average = categories("dvsa-mot-03-mot-class-3-and-4-vehicles-initial-failures-by-defect-category.csv")
bike_categories, bike_overall, bike_average = categories("dvsa-mot-02-mot-class-1-and-2-vehicles-initial-failures-by-defect-category.csv")
_, class5_overall, _ = categories("dvsa-mot-04-mot-class-5-vehicles-initial-failures-by-defect-category.csv")
_, class7_overall, _ = categories("dvsa-mot-05-mot-class-7-vehicles-initial-failures-by-defect-category.csv")

# The swap above, confirmed by the defect tables' own dangerous rates.
for key, overall in [("cars", car_overall), ("motorcycles", bike_overall), ("class5", class5_overall), ("class7", class7_overall)]:
    row = by_class[key]
    mine = round(100 * row["testsWithDangerousDefect"] / row["tests"], 2)
    assert abs(mine - overall["dangerousPercentOfTests"]) < 0.006, (key, mine, overall)

stations = next(r for r in rows("dvsa-mot-06-mot-test-stations-and-testers.csv") if r["Financial year"].strip() == YEAR)

data = {
    "year": YEAR,
    "byClass": by_class,
    "trend": trend_list,
    "carCategories": car_categories,
    "motorcycleCategories": bike_categories,
    "averageDefectsPerFailure": {"cars": car_average, "motorcycles": bike_average},
    "testStations": num(stations["Private MOT test stations"]) + num(stations["Other MOT test stations"]),
    "testers": num(stations["MOT nominated testers"]),
}

header = """// Place at: src/lib/mot/motStatistics.ts
//
// GENERATED by scripts/generate-mot-statistics.py from DVSA's "MOT testing
// data for Great Britain" CSVs - don't edit by hand; re-run the script when
// DVSA publishes a new year (usually September). See the script for the
// 2025-26 "dangerous" column correction.

export const MOT_STATISTICS_SOURCE = {
  name: "DVSA: MOT testing data for Great Britain",
  url: "https://www.gov.uk/government/statistical-data-sets/mot-testing-data-for-great-britain",
  published: "2026-09-10",
  licence: "Open Government Licence v3.0",
  licenceUrl: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
};

export interface MotClassFigures {
  tests: number;
  fails: number;
  passedAfterRectification: number;
  testsWithDangerousDefect: number;
}

export interface MotDefectCategory {
  category: string;
  percentOfTests: number;
  percentOfDefects: number;
  dangerousPercentOfTests: number | null;
}

export interface MotStatistics {
  year: string;
  byClass: Record<"motorcycles" | "cars" | "class5" | "class7" | "all", MotClassFigures>;
  trend: { year: string; cars: number; motorcycles: number }[];
  carCategories: MotDefectCategory[];
  motorcycleCategories: MotDefectCategory[];
  averageDefectsPerFailure: { cars: number | null; motorcycles: number | null };
  testStations: number;
  testers: number;
}

"""
with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
    fh.write(header + "export const MOT_STATISTICS: MotStatistics = " + json.dumps(data, indent=2) + ";\n")
print("wrote", os.path.normpath(OUT))
