"""Black-and-white bar chart: share of divisions at or past each AGS phase line on its planned date.

Same rule and data as the app's Plan vs Actual tab (app/src/lib/crossing.ts share()), so the numbers match what the
dashboard shows: of that day's Frontier points inside the phase line's latitude span, the share east of the line or no
more than REACH_KM short of it. Planned dates as agreed with Sorin on 11-6-2026 (phase 3 "mid-July" = 22 Jul, the middle of
15-30 Jul). Writes figures/arrival/arrival_bars.{pdf,png} and arrival.csv. Usage: python figures/arrival_bars.py
"""
import json
import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402
from matplotlib.path import Path as MplPath  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
APPDATA = ROOT / "app" / "src" / "data"
OUT = ROOT / "figures" / "arrival"
REACH_KM = 10
PLANNED = {"1": "1941-06-30", "2": "1941-07-07", "3": "1941-07-22", "4": "1941-07-25", "5": "1941-07-30"}
EAST = 60  # same polygon closure as the app

plt.rcParams.update({"font.family": ["Arial", "DejaVu Sans"], "font.size": 8, "pdf.fonttype": 42, "axes.linewidth": 0.6})


def distance_km(p, line):
    """Port of distanceToLineKm: flat-earth distance from a lon/lat point to a lon/lat polyline."""
    kx, ky = math.cos(math.radians(p[1])) * 111.32, 110.57
    px, py, best = p[0] * kx, p[1] * ky, math.inf
    for (x0, y0), (x1, y1) in zip(line, line[1:]):
        ax, ay, dx, dy = x0 * kx, y0 * ky, x1 * kx - x0 * kx, y1 * ky - y0 * ky
        L = dx * dx + dy * dy
        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L)) if L else 0.0
        best = min(best, math.hypot(px - ax - t * dx, py - ay - t * dy))
    return best


def share(line, pts):
    """Port of crossings().share: arrived = east of the line or within REACH_KM of it, among points in its latitude span."""
    lo, hi = min(c[1] for c in line), max(c[1] for c in line)
    poly = MplPath([*line, (EAST, line[-1][1]), (EAST, line[0][1]), line[0]])
    pts = [p for p in pts if lo <= p[1] <= hi]
    if not pts:
        return None, 0
    hit = sum(poly.contains_point(p) or distance_km(p, line) <= REACH_KM for p in pts)
    return hit / len(pts), len(pts)


def arrival():
    lines = json.loads((APPDATA / "milestones.json").read_text(encoding="utf8"))["AGS_PhaseLines"]["features"]
    points = json.loads((APPDATA / "frontier_points.json").read_text(encoding="utf8"))["features"]
    rows = []
    for f in sorted(lines, key=lambda f: f["properties"]["line_id"]):
        L, g = f["properties"]["line_id"], f["geometry"]
        line = g["coordinates"] if g["type"] == "LineString" else [c for part in g["coordinates"] for c in part]
        day = PLANNED[L]
        pts = [p["geometry"]["coordinates"] for p in points if p["geometry"] and str(p["properties"]["Date"])[:10] == day]
        s, n = share(line, pts)
        rows.append({"phase": L, "planned_date": day, "points_in_band": n, "arrived_pct": round(100 * s) if s is not None else None})
    return pd.DataFrame(rows)


def draw(df, stem):
    fig, ax = plt.subplots(figsize=(129 / 25.4, 2.4))
    labels = [f"Phase {r.phase}\n{pd.Timestamp(r.planned_date):%d %b}" for r in df.itertuples()]
    bars = ax.bar(labels, df.arrived_pct.fillna(0), color="0.35", edgecolor="black", linewidth=0.6, width=0.6)
    for b, v in zip(bars, df.arrived_pct):
        ax.text(b.get_x() + b.get_width() / 2, (v or 0) + 2, f"{v}%" if v is not None else "n/a", ha="center", va="bottom")
    ax.set_ylim(0, 100)
    ax.set_ylabel(f"Divisions at or within {REACH_KM} km\nof the phase line (%)")
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    for ext in ("pdf", "png"):
        fig.savefig(f"{stem}.{ext}", dpi=300)
    plt.close(fig)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    df = arrival()
    # Self-check against the dashboard as read in the 11-6 meeting (10 km reach): phase 1 61%, phase 2 49%.
    got = dict(zip(df.phase, df.arrived_pct))
    assert abs(got["1"] - 61) <= 2 and abs(got["2"] - 49) <= 2, got
    df.to_csv(OUT / "arrival.csv", index=False)
    draw(df, OUT / "arrival_bars")
    print(df.to_string(index=False))


if __name__ == "__main__":
    main()
