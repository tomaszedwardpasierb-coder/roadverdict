# Draws the MOT first-time fail rate map (public/images/mot-fail-rate-map-<year>.png)
# for /mot-statistics/by-area, Reddit and press: every postcode area shaded by
# its car first-time fail rate, from the same figures as the page.
#
#   python -I scripts/make-mot-fail-rate-map.py <areas.json> <boundaries folder> <out.png>
#
# areas.json is MOT_AREA_STATISTICS from src/lib/mot/motAreaStatistics.ts as
# JSON. The boundaries folder holds one GeoJSON file per postcode area
# (AB.geojson ...), from github.com/missinglink/uk-postcode-polygons
# (geojson/<area>.geojson) - © Wikipedia contributors, CC BY-SA 3.0, so the
# map carries that licence and credit too. Then reduce it to 128 colours
# (PIL quantize, no dither) before committing: about 220 KB instead of 660.
import json
import os
import sys
from collections import Counter

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from matplotlib.patches import Polygon, Rectangle
import numpy as np

plt.rcParams["font.family"] = ["Segoe UI", "DejaVu Sans"]

areas_path, geo_dir, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
data = json.load(open(areas_path, encoding="utf-8"))
gb = data["greatBritain"]
gb_rate = gb["failedFirstTime"] / gb["tests"] * 100
rate = {a["code"]: a["failedFirstTime"] / a["tests"] * 100 for a in data["areas"]}
name = {a["code"]: a["name"] for a in data["areas"]}

# Six 2-point bands, one hue (amber), light to dark = more fails.
BINS = [(0, 24, "under 24%"), (24, 26, "24-26%"), (26, 28, "26-28%"), (28, 30, "28-30%"), (30, 32, "30-32%"), (32, 100, "32% or more")]
RAMP = ["#FBE7CB", "#F6C98C", "#EEA654", "#D97E2A", "#AF5719", "#71330C"]
NO_DATA = "#D9D6CF"
PAPER = "#F7F5F0"
INK = "#1C1D20"
SOFT = "#54555A"


def colour(code):
    r = rate.get(code)
    if r is None:
        return NO_DATA
    for (lo, hi, _), c in zip(BINS, RAMP):
        if lo <= r < hi:
            return c
    return RAMP[-1]


def rings_of(path):
    d = json.load(open(path, encoding="utf-8"))
    for f in d["features"]:
        geoms = f["geometry"].get("geometries") or [f["geometry"]]
        for g in geoms:
            if g["type"] not in ("Polygon", "MultiPolygon"):
                continue
            polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
            for poly in polys:
                for ring in poly:
                    yield [(x, y) for x, y, *_ in ring]


shapes = {}
for fn in sorted(os.listdir(geo_dir)):
    if fn.endswith(".geojson"):
        shapes[fn[:-8]] = list(rings_of(os.path.join(geo_dir, fn)))
# Shetland, moved south-east into the North Sea and boxed, as maps of Britain do.
SHETLAND_SHIFT = (1.75, -2.35)
if "ZE" in shapes:
    shapes["ZE"] = [[(x + SHETLAND_SHIFT[0], y + SHETLAND_SHIFT[1]) for x, y in ring] for ring in shapes["ZE"]]


def outline(rings):
    # The area's own edge: district edges shared inside the area cancel out.
    key = lambda a, b: (a, b) if a <= b else (b, a)
    seg = Counter()
    for ring in rings:
        pts = [(round(x, 4), round(y, 4)) for x, y in ring]
        for a, b in zip(pts, pts[1:]):
            if a != b:
                seg[key(a, b)] += 1
    return [s for s, n in seg.items() if n == 1]


ASPECT = 1 / np.cos(np.radians(54.0))


def draw(ax, codes, lw):
    for code in codes:
        c = colour(code)
        for ring in shapes[code]:
            ax.add_patch(Polygon(ring, closed=True, facecolor=c, edgecolor=c, linewidth=0.25, joinstyle="round"))
    segs = [s for code in codes for s in outline(shapes[code])]
    ax.add_collection(LineCollection(segs, colors=PAPER, linewidths=lw))
    ax.set_aspect(ASPECT)
    ax.axis("off")


fig = plt.figure(figsize=(15, 19), dpi=100, facecolor=PAPER)

# Title block.
fig.text(0.05, 0.965, "Where cars fail their MOT first time", fontsize=40, fontweight="bold", color=INK, va="top")
fig.text(
    0.05,
    0.928,
    f"First-time MOT fail rate in {data['year']}, by the postcode area of the test centre.\n"
    f"Cars and light vans. Great Britain overall: {gb_rate:.1f}%.",
    fontsize=19,
    color=SOFT,
    va="top",
    linespacing=1.45,
)

# Great Britain: below the legend, left of the side column.
ax = fig.add_axes([0.0, 0.07, 0.60, 0.74])
ax.set_facecolor(PAPER)
draw(ax, list(shapes.keys()), 0.7)
ax.set_xlim(-8.3, 2.0)
ax.set_ylim(49.85, 59.5)
if "ZE" in shapes:
    xs = [x for ring in shapes["ZE"] for x, _ in ring]
    ys = [y for ring in shapes["ZE"] for _, y in ring]
    pad = 0.12
    ax.add_patch(Rectangle((min(xs) - pad, min(ys) - pad), max(xs) - min(xs) + 2 * pad, max(ys) - min(ys) + 2 * pad, fill=False, edgecolor="#B9B5AC", linewidth=1.0))

# London inset.
LONDON = ["E", "EC", "N", "NW", "SE", "SW", "W", "WC", "BR", "CR", "DA", "EN", "HA", "IG", "KT", "RM", "SM", "TW", "UB"]
ix = fig.add_axes([0.62, 0.555, 0.35, 0.235])
ix.set_facecolor(PAPER)
draw(ix, [c for c in LONDON if c in shapes], 1.0)
ix.set_xlim(-0.56, 0.33)
ix.set_ylim(51.27, 51.72)
ix.axis("on")
ix.set_xticks([])
ix.set_yticks([])
for side in ix.spines.values():
    side.set_edgecolor("#B9B5AC")
# The outer areas are named on the inset; the small inner ones are listed under it.
for code in ["IG", "RM", "UB", "SM", "BR", "EN", "HA", "TW", "DA"]:
    r = rate.get(code)
    if r is None:
        continue
    xs = [x for ring in shapes[code] for x, _ in ring]
    ys = [y for ring in shapes[code] for _, y in ring]
    cx = min(max(float(np.median(xs)), -0.50), 0.27)
    cy = min(max(float(np.median(ys)), 51.30), 51.69)
    ix.text(cx, cy, f"{name[code].split(' (')[0]}\n{r:.1f}%", ha="center", va="center", fontsize=10.5, color=INK, linespacing=1.1)
fig.text(0.62, 0.80, "London", fontsize=20, fontweight="bold", color=INK)
inner = [f"{c} {rate[c]:.1f}%" for c in ["E", "N", "NW", "SE", "SW", "W"] if c in rate]
fig.text(
    0.62,
    0.545,
    "Inner London: " + " · ".join(inner[:3]) + " ·\n" + " · ".join(inner[3:]) + ". EC and WC have no car test centres.",
    fontsize=12,
    color=SOFT,
    va="top",
    linespacing=1.5,
)

# Highest and lowest.
ranked = sorted(rate.items(), key=lambda kv: -kv[1])


def table(y, title, rows):
    fig.text(0.62, y, title, fontsize=19, fontweight="bold", color=INK, va="top")
    for i, (code, r) in enumerate(rows):
        yy = y - 0.032 - i * 0.026
        fig.patches.append(Rectangle((0.62, yy - 0.006), 0.014, 0.014, transform=fig.transFigure, facecolor=colour(code), edgecolor="#B9B5AC", linewidth=0.6))
        fig.text(0.642, yy, f"{name[code]}", fontsize=15, color=INK, va="center")
        fig.text(0.965, yy, f"{r:.1f}%", fontsize=15, color=INK, va="center", ha="right", fontweight="bold")


table(0.46, "Highest first-time fail rate", ranked[:5])
table(0.28, "Lowest", ranked[::-1][:5])

# Legend.
lx, ly = 0.05, 0.875
fig.text(lx, ly, "Failed first time", fontsize=14, color=SOFT, va="top")
for i, ((_, _, label), c) in enumerate(zip(BINS, RAMP)):
    x = lx + i * 0.083
    fig.patches.append(Rectangle((x, ly - 0.040), 0.078, 0.014, transform=fig.transFigure, facecolor=c, edgecolor="#B9B5AC", linewidth=0.6))
    fig.text(x, ly - 0.046, label, fontsize=12, color=SOFT, va="top")

# Credits.
fig.text(
    0.05,
    0.035,
    f"Data: DVSA anonymised MOT tests and results, {data['year']} (Open Government Licence v3.0). Postcode area boundaries:\n"
    "© Wikipedia contributors (CC BY-SA 3.0). Map by RoadVerdict, CC BY-SA 3.0. Every area: roadverdict.co.uk/mot-statistics/by-area",
    fontsize=12,
    color=SOFT,
    va="top",
    linespacing=1.5,
)

fig.savefig(out_path, facecolor=PAPER)
print("saved", out_path)
