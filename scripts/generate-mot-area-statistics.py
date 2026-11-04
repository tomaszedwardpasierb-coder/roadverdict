# Writes src/lib/mot/motAreaStatistics.ts from DVSA's anonymised MOT test
# data, so no figure on /mot-statistics/by-area is typed by hand.
#
#   python -I -X utf8 scripts/generate-mot-area-statistics.py <folder with the DVSA zips>
#
# The folder needs dft_test_result_extracts_2025.zip,
# dft_test_item_extracts_2025.zip and lookup.zip from
# https://open.data.dvsa.gov.uk/mot-anonymised/index.html (about 9 GB; the
# CSVs are read straight out of the zips). Takes a few minutes.
#
# What's counted, matching how DVSA reports MOT results:
# - cars and light vans only (class 4) - motorcycles are left out for now;
# - first tests only (test type NT): retests and appeals are left out;
# - "failed first time" = Fail + PRS (failed, fixed at the test centre
#   within an hour, passed); abandoned and aborted tests are left out;
# - "dangerous" = the test recorded at least one fail or PRS defect marked D;
# - the postcode area is where the test centre is, not where the car lives;
# - areas with fewer than MIN_TESTS tests are left out of the ranking;
# - tests with no area recorded (DVSA writes "XX") count only in the total.
import collections
import csv
import io
import json
import os
import sys
import zipfile

D = sys.argv[1]
YEAR = 2025
MIN_TESTS = 5000
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "lib", "mot", "motAreaStatistics.ts")

# Royal Mail's name for each postcode area (the main post town), with the
# better-known place in brackets where the town alone would mislead.
AREA_NAMES = {
    "AB": "Aberdeen", "AL": "St Albans", "B": "Birmingham", "BA": "Bath", "BB": "Blackburn", "BD": "Bradford",
    "BH": "Bournemouth", "BL": "Bolton", "BN": "Brighton", "BR": "Bromley", "BS": "Bristol", "CA": "Carlisle",
    "CB": "Cambridge", "CF": "Cardiff", "CH": "Chester", "CM": "Chelmsford", "CO": "Colchester", "CR": "Croydon",
    "CT": "Canterbury", "CV": "Coventry", "CW": "Crewe", "DA": "Dartford", "DD": "Dundee", "DE": "Derby",
    "DG": "Dumfries", "DH": "Durham", "DL": "Darlington", "DN": "Doncaster", "DT": "Dorchester", "DY": "Dudley",
    "E": "East London", "EC": "Central London (EC)", "EH": "Edinburgh", "EN": "Enfield", "EX": "Exeter",
    "FK": "Falkirk", "FY": "Blackpool", "G": "Glasgow", "GL": "Gloucester", "GU": "Guildford", "HA": "Harrow",
    "HD": "Huddersfield", "HG": "Harrogate", "HP": "Hemel Hempstead", "HR": "Hereford", "HS": "Outer Hebrides",
    "HU": "Hull", "HX": "Halifax", "IG": "Ilford", "IP": "Ipswich", "IV": "Inverness", "KA": "Kilmarnock",
    "KT": "Kingston upon Thames", "KW": "Kirkwall", "KY": "Kirkcaldy (Fife)", "L": "Liverpool", "LA": "Lancaster",
    "LD": "Llandrindod Wells", "LE": "Leicester", "LL": "Llandudno", "LN": "Lincoln", "LS": "Leeds", "LU": "Luton",
    "M": "Manchester", "ME": "Rochester (Medway)", "MK": "Milton Keynes", "ML": "Motherwell", "N": "North London",
    "NE": "Newcastle upon Tyne", "NG": "Nottingham", "NN": "Northampton", "NP": "Newport", "NR": "Norwich",
    "NW": "North West London", "OL": "Oldham", "OX": "Oxford", "PA": "Paisley", "PE": "Peterborough", "PH": "Perth",
    "PL": "Plymouth", "PO": "Portsmouth", "PR": "Preston", "RG": "Reading", "RH": "Redhill", "RM": "Romford",
    "S": "Sheffield", "SA": "Swansea", "SE": "South East London", "SG": "Stevenage", "SK": "Stockport",
    "SL": "Slough", "SM": "Sutton", "SN": "Swindon", "SO": "Southampton", "SP": "Salisbury", "SR": "Sunderland",
    "SS": "Southend-on-Sea", "ST": "Stoke-on-Trent", "SW": "South West London", "SY": "Shrewsbury", "TA": "Taunton",
    "TD": "Galashiels", "TF": "Telford", "TN": "Tonbridge", "TQ": "Torquay", "TR": "Truro", "TS": "Cleveland",
    "TW": "Twickenham", "UB": "Southall", "W": "West London", "WA": "Warrington", "WC": "Central London (WC)",
    "WD": "Watford", "WF": "Wakefield", "WN": "Wigan", "WR": "Worcester", "WS": "Walsall", "WV": "Wolverhampton",
    "YO": "York", "ZE": "Shetland",
}
NO_AREA = "XX"
LONDON = {"E", "EC", "N", "NW", "SE", "SW", "W", "WC", "BR", "CR", "DA", "EN", "HA", "IG", "KT", "RM", "SM", "TW", "UB"}

# DVSA's wording for the defects that come top somewhere, in plain English.
# Anything not listed is shown as DVSA words it (the script prints those).
PLAIN = {
    "Position lamp: not working": "Sidelight not working",
    "Stop lamp: not working": "Brake light not working",
    "Headlamp: not working on dipped beam": "Dipped headlight not working",
    "Headlamp aim: projected beam image is obviously incorrect": "Headlight aimed wrongly",
    "Tread depth: tread depth below requirements of 1.6mm": "Tyre tread below 1.6mm",
    "Condition: has a cut in excess of the requirements deep enough to reach the ply or cords": "Tyre cut down to the cords",
    "Condition: has ply or cords exposed": "Tyre cords showing",
    "Wipers: does not clear the windscreen effectively": "Wipers not clearing the screen",
    "Washers: provides insufficient washer liquid": "Screenwash empty",
    "Coil spring: fractured or broken": "Broken coil spring",
    "Pins and bushes: pin or bush excessively worn": "Worn suspension pin or bush",
    "Ball joint: ball joint excessively worn": "Worn suspension ball joint",
    "Brake pads: less than 1.5 mm thick": "Brake pads below 1.5mm",
    "Rigid brake pipes: excessively corroded": "Corroded brake pipe",
    "Malfunction indicator lamp: inoperative or indicates a malfunction": "Dashboard warning light on",
}


def csvs(zip_name):
    zf = zipfile.ZipFile(os.path.join(D, zip_name))
    for name in sorted(n for n in zf.namelist() if n.endswith(".csv")):
        with zf.open(name) as fh:
            fh.readline()
            yield from fh


# Pass 1: every first test on a car, by postcode area.
tests = collections.Counter()
failed = collections.Counter()
age_sum = collections.Counter()
area_of_failed = {}  # test_id -> area, for failed tests only
for line in csvs(f"dft_test_result_extracts_{YEAR}.zip"):
    p = line.split(b",", 8)
    if p[3] != b"4" or p[4] != b"NT" or p[5] not in (b"P", b"F", b"PRS"):
        continue
    area = p[7].decode()
    tests[area] += 1
    first_used = line.rsplit(b",", 2)[1][:4]
    if first_used.isdigit():
        age_sum[area] += YEAR - int(first_used)
    if p[5] != b"P":
        failed[area] += 1
        area_of_failed[p[0]] = area
print(f"{sum(tests.values()):,} first tests, {len(area_of_failed):,} failed", file=sys.stderr)

unknown = sorted(a for a in tests if a not in AREA_NAMES and a != NO_AREA)
if unknown:
    sys.exit(f"No name for postcode areas {unknown}: add them to AREA_NAMES")

# The defects' wording.
lookup = zipfile.ZipFile(os.path.join(D, "lookup.zip"))
detail = {}
for r in csv.DictReader(io.TextIOWrapper(lookup.open("item_detail.csv"), "utf-8"), delimiter="|"):
    if r["test_class_id"] == "4":
        detail[r["rfr_id"]] = r
groups = {}
for r in csv.DictReader(io.TextIOWrapper(lookup.open("item_group.csv"), "utf-8"), delimiter="|"):
    if r["test_class_id"] == "4":
        groups[r["test_item_id"]] = r["item_name"]


def label(rfr_id):
    d = detail.get(rfr_id)
    if not d:
        return f"Defect {rfr_id}"
    return f'{groups.get(d["test_item_id"], "?")}: {d["rfr_desc"].strip()}'


# Pass 2: the fail and PRS defects on those failed tests.
dangerous = set()
defects = collections.defaultdict(collections.Counter)  # area -> rfr_id -> times
for line in csvs(f"dft_test_item_extracts_{YEAR}.zip"):
    p = line.split(b",")
    area = area_of_failed.get(p[0])
    if area is None or p[2] not in (b"F", b"P"):
        continue
    defects[area][p[1].decode()] += 1
    if p[4] == b"D":
        dangerous.add(p[0])
dangerous_by_area = collections.Counter(area_of_failed[t] for t in dangerous)

areas = []
for code, n in tests.items():
    if n < MIN_TESTS or code == NO_AREA:
        continue
    rfr, times = defects[code].most_common(1)[0]
    dvsa = label(rfr)
    if dvsa not in PLAIN:
        print(f"no plain wording for {dvsa!r} (top in {code})", file=sys.stderr)
    areas.append({
        "code": code,
        "name": AREA_NAMES[code],
        "london": code in LONDON,
        "tests": n,
        "failedFirstTime": failed[code],
        "testsWithDangerousDefect": dangerous_by_area[code],
        "averageAgeYears": round(age_sum[code] / n, 1),
        "topFailure": {"defect": PLAIN.get(dvsa, dvsa), "times": times},
    })
areas.sort(key=lambda a: (-a["failedFirstTime"] / a["tests"], a["code"]))

gb_tests = sum(tests.values())
data = {
    "year": YEAR,
    "minTests": MIN_TESTS,
    "greatBritain": {
        "tests": gb_tests,
        "failedFirstTime": sum(failed.values()),
        "testsWithDangerousDefect": len(dangerous),
        "averageAgeYears": round(sum(age_sum.values()) / gb_tests, 1),
    },
    "leftOut": sorted(a for a, n in tests.items() if n < MIN_TESTS and a != NO_AREA),
    "noAreaTests": tests[NO_AREA],
    "noCarTests": [AREA_NAMES[a] for a in sorted(AREA_NAMES) if a not in tests],
    "areas": areas,
}

HEADER = """// Place at: src/lib/mot/motAreaStatistics.ts
//
// GENERATED by scripts/generate-mot-area-statistics.py from DVSA's anonymised
// MOT test data - don't edit by hand; see the script for what's counted.
// Cars and light vans (class 4), first tests in the calendar year, by the
// postcode area of the test centre. Areas are ordered from the highest
// first-time fail rate to the lowest.

export const MOT_AREA_STATISTICS_SOURCE = {
  name: "DVSA: anonymised MOT tests and results",
  url: "https://open.data.dvsa.gov.uk/mot-anonymised/index.html",
  licence: "Open Government Licence v3.0",
  licenceUrl: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
};

export interface MotAreaCounts {
  tests: number;
  failedFirstTime: number;
  testsWithDangerousDefect: number;
  averageAgeYears: number;
}

export interface MotArea extends MotAreaCounts {
  code: string;
  name: string;
  london: boolean;
  topFailure: { defect: string; times: number };
}

export interface MotAreaStatistics {
  year: number;
  minTests: number;
  greatBritain: MotAreaCounts;
  leftOut: string[];
  noAreaTests: number;
  noCarTests: string[];
  areas: MotArea[];
}

export const MOT_AREA_STATISTICS: MotAreaStatistics = """

with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
    fh.write(HEADER + json.dumps(data, indent=2, ensure_ascii=False) + ";\n")
print(f"wrote {len(areas)} areas to {os.path.normpath(OUT)}", file=sys.stderr)
