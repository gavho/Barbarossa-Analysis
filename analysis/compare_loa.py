"""Compare realized cluster average paths with the planned (pre-war) lines of advance, Frontier box.

Planned: milestones/AGS_Milestones.gdb  (AGS_AdvanceLines, hand-digitized from the historian's slide)
Realized: data/agol_export/DirectionalVector_Cluster_Avg_Paths.geojson (primary, as in the paper's Fig. 5)
          data/agol_export/Geometric_Cluster_avg_paths.geojson       (robustness check)
Membership: data/agol_export/Frontier_Paths.geojson + agol/frontier_unit_names.csv

Steps (see analysis/loa_frontier/README.md for the reasoning):
 1. everything in one azimuthal-equidistant projection (km), lines oriented west to east
 2. pair planned and realized lines by minimum Frechet distance (Hungarian assignment) on their common extent
 3. simplify each pair to the same number of vectors (<= 3, each >= MIN_SEG_KM) and compare bearings / turns / vertices
 4. signed cross-track offset, corridor containment, endpoint gaps, spacing between adjacent lines
 5. cross-check the pairing against which army's divisions each cluster contains

Usage: python analysis/compare_loa.py        (writes analysis/loa_frontier/*)
"""
import math
import warnings
from pathlib import Path

import geopandas as gpd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from pyproj import Transformer
from scipy.optimize import linear_sum_assignment
from shapely import ops
from shapely.geometry import LineString, MultiLineString, Point

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "agol_export"
OUT = ROOT / "analysis" / "loa_frontier"
AEQD = "+proj=aeqd +lat_0=50 +lon_0=29 +datum=WGS84 +units=km"  # distances in km; origin 50N 29E
_to_km = Transformer.from_crs(4326, AEQD, always_xy=True)

K = 3  # vectors per line, as agreed with Sorin
MIN_SEG_KM = 60  # a vector shorter than this is noise (digitizing 5-10 km, georeferencing 3-4 km, 25-30 km aggregation)
SENSITIVITY_MIN_SEG = (40, 60, 80)
NOISE_OFFSET_KM = 20  # differences below this are within digitizing + georeferencing error
NOISE_BEARING_DEG = 10
MIN_COMMON_KM = 100  # pairs sharing less than this are not comparable
CLUSTERINGS = {"DV": "DirectionalVector_Cluster_Avg_Paths", "GEO": "Geometric_Cluster_avg_paths"}
CITIES = {"Lviv": (49.84, 24.03), "Rivne": (50.62, 26.25), "Zhytomyr": (50.25, 28.66), "Kyiv": (50.45, 30.52),
          "Vinnytsia": (49.23, 28.47), "Uman": (48.75, 30.22)}


# ---------------------------------------------------------------- geometry helpers
def to_km(geom, tr=None):
    """Project lon/lat to km; `tr` swaps in another region's equidistant projection."""
    return ops.transform((tr or _to_km).transform, geom)


def merge_line(geom):
    if isinstance(geom, MultiLineString):
        geom = ops.linemerge(geom)
        if isinstance(geom, MultiLineString):
            geom = LineString([c for part in geom.geoms for c in part.coords])
    return geom


def orient_east(line):
    return LineString(line.coords[::-1]) if line.coords[0][0] > line.coords[-1][0] else line


def dense(line, step=2.0):
    n = max(2, int(line.length // step) + 1)
    return np.array([line.interpolate(d).coords[0] for d in np.linspace(0, line.length, n)])


def clip_x(line, xmin, xmax):
    """The stretch of `line` from where it first reaches xmin to where it first passes xmax."""
    P = dense(line)
    inside = np.where(P[:, 0] >= xmin)[0]
    if not len(inside):
        return None
    i0 = inside[0]
    beyond = np.where(P[i0:, 0] > xmax)[0]
    seg = P[i0 : i0 + (beyond[0] if len(beyond) else len(P) - i0)]
    return LineString(seg) if len(seg) >= 2 and LineString(seg).length > 1 else None


def common_clip(a, b):
    xmin = max(a.coords[0][0], b.coords[0][0])
    xmax = min(max(c[0] for c in a.coords), max(c[0] for c in b.coords))
    if xmax <= xmin:
        return None, None
    ca, cb = clip_x(a, xmin, xmax), clip_x(b, xmin, xmax)
    if ca is None or cb is None or min(ca.length, cb.length) < MIN_COMMON_KM:
        return None, None
    return ca, cb


def bearing(a, b):
    return (math.degrees(math.atan2(b[0] - a[0], b[1] - a[1])) + 360) % 360  # compass degrees, 0 = north


def wrap(d):
    return ((d + 180) % 360) - 180


def fit_segments(line, k, min_km, n=120):
    """Best k-segment polyline through `line`: dynamic program over n resampled points minimizing the summed
    squared distance to the segments, with every segment at least min_km long. Returns (vertices, rms km)."""
    P = np.array([line.interpolate(t, normalized=True).coords[0] for t in np.linspace(0, 1, n)])
    mp = max(1, math.ceil(min_km / (line.length / (n - 1))))
    if k * mp > n - 1:
        raise ValueError("line too short for the requested segments")
    cost = np.full((n, n), np.inf)
    for i in range(n):
        for j in range(i + mp, n):
            a, ab = P[i], P[j] - P[i]
            L2 = ab @ ab
            if L2 < min_km**2:  # the vector itself (not the path along it) must be long enough
                continue
            seg = P[i : j + 1] - a
            t = np.clip(seg @ ab / L2, 0, 1) if L2 else np.zeros(len(seg))
            cost[i, j] = ((seg - np.outer(t, ab)) ** 2).sum()
    dp = np.full((k + 1, n), np.inf)
    prev = np.zeros((k + 1, n), int)
    dp[0, 0] = 0
    for s in range(1, k + 1):
        for j in range(1, n):
            c = dp[s - 1, :j] + cost[:j, j]
            i = int(np.argmin(c))
            dp[s, j], prev[s, j] = c[i], i
    idx, j = [n - 1], n - 1
    for s in range(k, 0, -1):
        j = prev[s, j]
        idx.append(j)
    return P[idx[::-1]], math.sqrt(dp[k, n - 1] / n)


def frechet(a, b, n=60):
    """Discrete Frechet distance between two lines (km), respecting direction of travel."""
    A = np.array([a.interpolate(t, normalized=True).coords[0] for t in np.linspace(0, 1, n)])
    B = np.array([b.interpolate(t, normalized=True).coords[0] for t in np.linspace(0, 1, n)])
    D = np.linalg.norm(A[:, None] - B[None], axis=2)
    ca = np.zeros((n, n))
    ca[0, 0] = D[0, 0]
    for i in range(1, n):
        ca[i, 0] = max(ca[i - 1, 0], D[i, 0])
    for j in range(1, n):
        ca[0, j] = max(ca[0, j - 1], D[0, j])
    for i in range(1, n):
        for j in range(1, n):
            ca[i, j] = max(min(ca[i - 1, j], ca[i, j - 1], ca[i - 1, j - 1]), D[i, j])
    return ca[-1, -1]


def signed_offsets(planned, realized, step=10.0):
    """Distance along `planned` (km) and signed offset of `realized` from it; positive = left of travel = north."""
    s = np.arange(0, planned.length, step)
    out = []
    for d in s:
        p = np.array(planned.interpolate(d).coords[0])
        t = np.array(planned.interpolate(min(d + 5, planned.length)).coords[0]) - np.array(
            planned.interpolate(max(d - 5, 0)).coords[0])
        q = np.array(realized.interpolate(realized.project(Point(p))).coords[0])
        cross = t[0] * (q[1] - p[1]) - t[1] * (q[0] - p[0])
        out.append(math.copysign(np.linalg.norm(q - p), cross))
    return s, np.array(out)


def containment(a, b, tol, step=10.0):
    """Share of `a` (sampled every step km) lying within tol km of `b`."""
    pts = [Point(a.interpolate(d).coords[0]) for d in np.arange(0, a.length, step)]
    return float(np.mean([b.distance(p) <= tol for p in pts]))


# ---------------------------------------------------------------- inputs
def planned_lines():
    adv = gpd.read_file(ROOT / "milestones" / "AGS_Milestones.gdb", layer="AGS_AdvanceLines")
    return {r.unit: orient_east(merge_line(to_km(r.geometry))) for r in adv.itertuples()}


def cluster_lines(name, tr=None):
    d = gpd.read_file(DATA / f"{name}.geojson").sort_values(["Cluster_ID", "Day_Index"])
    out = {}
    for cid, g in d.groupby("Cluster_ID"):
        pts = []
        for geom in g.geometry:
            geom = to_km(geom, tr)
            for part in getattr(geom, "geoms", [geom]):
                for c in part.coords:
                    if not pts or math.dist(pts[-1], c) > 1e-6:
                        pts.append(c)
        out[int(cid)] = LineString(pts)  # Day_Index order is the direction of travel; only planned lines need orienting
    return out


def army(group):
    g = str(group)
    if g.startswith("6th Army"):
        return "6A"
    if g.startswith("1st Panzer"):
        return "PzGp1"
    if g.startswith("17th Army"):
        return "17A"
    if any(s in g for s in ("Gyorshadtest", "Carpathian", "Slovak")):
        return "Allied"
    if g.startswith("11th"):
        return "11A"
    if "Rear Area" in g:
        return "RearArea"
    return "unknown"


PLANNED_UNIT = {  # planned line -> test on a unit's researched group text
    "6A": lambda g: army(g) == "6A",
    "III PzKo": lambda g: army(g) == "PzGp1" and "III Armeekorps" in str(g),
    "PzGp1(-)": lambda g: army(g) == "PzGp1" and "III Armeekorps" not in str(g),
    "17A": lambda g: army(g) == "17A",
}


def formations():
    """One row per formation with its cluster ids and researched group (unknown when not identified)."""
    paths = gpd.read_file(DATA / "Frontier_Paths.geojson")
    f = paths.groupby(["Nation", "Branch", "Num_Name"]).agg(DV=("DV_ClusterID", "first"), GEO=("Geo_ClusterID", "first")).reset_index()
    names = pd.read_csv(ROOT / "agol" / "frontier_unit_names.csv")
    names["Number"] = pd.to_numeric(names.Number, errors="coerce")
    names = names.drop_duplicates(["Nation", "Branch", "Number"])[["Nation", "Branch", "Number", "Group"]]
    f = f.merge(names, left_on=["Nation", "Branch", "Num_Name"], right_on=["Nation", "Branch", "Number"], how="left")
    f["Group"] = f.Group.fillna("")
    f["Army"] = f.Group.map(army)
    return f


def formation_lines(layer="Frontier_Paths", tr=None):
    """Each formation's full path (its dated segments joined in order), oriented west to east."""
    paths = gpd.read_file(DATA / f"{layer}.geojson").sort_values(["Nation", "Branch", "Num_Name", "Start_Date"])
    out = {}
    for key, g in paths.groupby(["Nation", "Branch", "Num_Name"]):
        pts = []
        for geom in g.geometry:
            km = to_km(geom, tr)
            for part in getattr(km, "geoms", [km]):
                for q in part.coords:
                    if not pts or math.dist(pts[-1], q) > 1e-6:
                        pts.append(q)
        if len(pts) > 1:
            out[key] = LineString(pts)  # Start_Date order is the direction of travel
    return out


def average_line(lines, n=50):
    """The paper's average path: each member resampled to n points evenly along its length, then averaged point by point."""
    A = np.array([[l.interpolate(t, normalized=True).coords[0] for t in np.linspace(0, 1, n)] for l in lines])
    return LineString(A.mean(axis=0))


def member_lines(f, flines, mask):
    sub = f[mask]
    return [flines[k] for k in zip(sub.Nation, sub.Branch, sub.Num_Name) if k in flines]


def unit_lines(f, flines):
    """Realized line per planned unit: the average path of that unit's own identified divisions, whatever cluster they fell in."""
    lines, counts = {}, {}
    for unit, test in PLANNED_UNIT.items():
        ls = member_lines(f, flines, f.Group.map(test))
        if len(ls) >= 2:
            lines[unit], counts[unit] = average_line(ls), len(ls)
    return lines, counts


def reconstruction_check(f, flines, clusters, clustering):
    """Rebuild each stored cluster path from its member formations; a large gap would mean the inputs have drifted."""
    rows = []
    for cid, stored in clusters.items():
        ls = member_lines(f, flines, f[clustering] == cid)
        if len(ls) < 2:
            continue
        A = np.array([average_line(ls).interpolate(t, normalized=True).coords[0] for t in np.linspace(0, 1, 50)])
        B = np.array([stored.interpolate(t, normalized=True).coords[0] for t in np.linspace(0, 1, 50)])
        rows.append({"clustering": clustering, "cluster": cid, "members": len(ls),
                     "mean_point_gap_km": round(float(np.linalg.norm(A - B, axis=1).mean()), 1)})
    return pd.DataFrame(rows)


# ---------------------------------------------------------------- analysis
def membership_table(f, clustering):
    rows = []
    for cid, g in f.groupby(clustering):
        row = {"clustering": clustering, "cluster": int(cid), "formations": len(g)}
        for a in ("6A", "PzGp1", "17A", "Allied", "11A", "RearArea", "unknown"):
            row[f"pct_{a}"] = round(100 * (g.Army == a).mean(), 0)
        for unit, test in PLANNED_UNIT.items():
            mine = f[f.Group.map(test)]
            inside = g.Group.map(test)
            row[f"precision_{unit}"] = round(100 * inside.mean(), 0)  # share of this cluster that is the planned unit
            row[f"recall_{unit}"] = round(100 * inside.sum() / len(mine), 0) if len(mine) else np.nan  # share of the unit in this cluster
        rows.append(row)
    return pd.DataFrame(rows)


def pair_lines(planned, clusters):
    names, ids = list(planned), list(clusters)
    cost = np.full((len(names), len(ids)), 1e4)
    for i, p in enumerate(names):
        for j, c in enumerate(ids):
            a, b = common_clip(planned[p], clusters[c])
            if a is not None:
                cost[i, j] = frechet(a, b)
    r, c = linear_sum_assignment(cost)
    return {names[i]: ids[j] for i, j in zip(r, c)}, pd.DataFrame(cost, index=names, columns=ids)


def segment_rows(pname, cname, a, b, min_km, clustering):
    k = min(K, int(min(a.length, b.length) // min_km))
    if k < 1:
        return [], None
    Va, rms_a = fit_segments(a, k, min_km)
    Vb, rms_b = fit_segments(b, k, min_km)
    rows = []
    for i in range(k):
        ba, bb = bearing(Va[i], Va[i + 1]), bearing(Vb[i], Vb[i + 1])
        rows.append({"clustering": clustering, "planned": pname, "cluster": cname, "min_seg_km": min_km, "k": k, "segment": i + 1,
                     "planned_bearing": round(ba), "realized_bearing": round(bb), "bearing_diff": round(wrap(bb - ba)),
                     "planned_km": round(math.dist(Va[i], Va[i + 1])), "realized_km": round(math.dist(Vb[i], Vb[i + 1])),
                     "planned_turn": round(wrap(bearing(Va[i + 1], Va[i + 2]) - ba)) if i < k - 1 else None,
                     "realized_turn": round(wrap(bearing(Vb[i + 1], Vb[i + 2]) - bb)) if i < k - 1 else None,
                     "end_vertex_gap_km": round(math.dist(Va[i + 1], Vb[i + 1])),
                     "beyond_noise": abs(wrap(bb - ba)) > NOISE_BEARING_DEG})
    return rows, (Va, Vb, rms_a, rms_b)


def compare(planned, clusters, members, clustering, pairing=None):
    cost = None
    if pairing is None:
        pairing, cost = pair_lines(planned, clusters)
    order = sorted(pairing, key=lambda p: np.mean([c[1] for c in planned[p].coords]))  # south to north
    pair_rows, seg_rows, profiles, fits = [], [], {}, {}
    for p in order:
        cid = pairing[p]
        a, b = common_clip(planned[p], clusters[cid])
        if a is None:
            continue
        s, off = signed_offsets(a, b)
        profiles[p] = (s, off, cid)
        sa, sb = a.coords[0], a.coords[-1]
        ra, rb = b.coords[0], b.coords[-1]
        rec = members.loc[members.cluster == cid].iloc[0] if members is not None else None
        best = members.loc[members[f"recall_{p}"].idxmax(), "cluster"] if members is not None and members[f"recall_{p}"].notna().any() else None
        for mk in SENSITIVITY_MIN_SEG:
            rows, fit = segment_rows(p, cid, a, b, mk, clustering)
            seg_rows += rows
            if mk == MIN_SEG_KM:
                fits[p] = fit
        pair_rows.append({
            "clustering": clustering, "planned": p, "cluster": cid,
            "common_km": round(min(a.length, b.length)), "planned_km": round(a.length), "realized_km": round(b.length),
            "frechet_km": round(frechet(a, b)), "hausdorff_km": round(a.hausdorff_distance(b)),
            "mean_signed_offset_km": round(float(off.mean()), 1), "mean_abs_offset_km": round(float(np.abs(off).mean()), 1),
            "max_abs_offset_km": round(float(np.abs(off).max())),
            "share_beyond_noise_pct": round(100 * float((np.abs(off) > NOISE_OFFSET_KM).mean())),
            "realized_within_25km_pct": round(100 * containment(b, a, 25)), "realized_within_50km_pct": round(100 * containment(b, a, 50)),
            "planned_within_50km_pct": round(100 * containment(a, b, 50)),
            "start_gap_km": round(math.dist(sa, ra)), "end_gap_km": round(math.dist(sb, rb)),
            "straight_bearing_diff": round(wrap(bearing(ra, rb) - bearing(sa, sb))),
            "unit_best_cluster": best,  # where most of this planned unit's divisions actually went
            "membership_precision_pct": rec[f"precision_{p}"] if rec is not None else None,
            "membership_recall_pct": rec[f"recall_{p}"] if rec is not None else None,
            "cluster_unidentified_pct": rec["pct_unknown"] if rec is not None else None,
            "membership_agrees": (best == cid) if members is not None else None})
    return pairing, cost, pd.DataFrame(pair_rows), pd.DataFrame(seg_rows), profiles, fits


def spacing(planned, clusters, pairing, step=50):
    """North-south gaps between adjacent lines at transects crossed by every planned line and every matched cluster."""
    sets = {"planned": [planned[p] for p in pairing], "realized": [clusters[c] for c in pairing.values()]}
    xs = np.arange(math.ceil(max(l.coords[0][0] for v in sets.values() for l in v) / step) * step,
                   min(max(c[0] for c in l.coords) for v in sets.values() for l in v), step)

    def ys(lines, x):
        out = []
        for l in lines:
            hit = l.intersection(LineString([(x, -800), (x, 800)]))
            pts = [g for g in getattr(hit, "geoms", [hit]) if isinstance(g, Point)]
            if not pts:
                return None
            out.append(float(np.mean([g.y for g in pts])))
        return sorted(out)

    rows = []
    for x in xs:
        yp, yr = ys(sets["planned"], x), ys(sets["realized"], x)
        if yp is None or yr is None:
            continue
        gp, gr = np.diff(yp), np.diff(yr)
        lon = _to_km.transform(x, 0, direction="INVERSE")[0]
        rows.append({"x_km_east_of_29E": int(x), "lon": round(lon, 1), "planned_spread_km": round(yp[-1] - yp[0]),
                     "planned_mean_gap_km": round(gp.mean()), "planned_min_gap_km": round(gp.min()),
                     "realized_spread_km": round(yr[-1] - yr[0]), "realized_mean_gap_km": round(gr.mean()), "realized_min_gap_km": round(gr.min())})
    return pd.DataFrame(rows)


# ---------------------------------------------------------------- figure
def label_spot(line, others, taken, offset=9.0):
    """Where to put a label for `line`: the spot just above or below it that is farthest from every other line and label."""
    best, best_score = None, -1.0
    for frac in np.arange(0.08, 0.93, 0.04):
        x, y = line.interpolate(frac, normalized=True).coords[0]
        for dy, va in ((offset, "bottom"), (-offset, "top")):
            pt = Point(x, y + dy)
            score = min([o.distance(pt) for o in others] + [t.distance(pt) * 0.5 for t in taken] + [60.0])
            if score > best_score:
                best, best_score = (x, y + dy, va), score
    taken.append(Point(best[0], best[1]))
    return best


def draw(planned, clusters, pairing, profiles, fits, path, kind):
    """Plan view of planned vs realized lines (top) and the signed offset along each planned line (bottom).
    kind: "DV" (cluster average paths) or "UNIT" (average path of each planned unit's own divisions)."""
    import matplotlib.patheffects as pe
    from matplotlib.lines import Line2D
    from matplotlib.patches import Patch

    plt.rcParams.update({"font.family": ["Arial", "DejaVu Sans"], "font.size": 8, "pdf.fonttype": 42, "axes.linewidth": 0.6})
    city_xy = {n: _to_km.transform(lon, lat) for n, (lat, lon) in CITIES.items()}
    xs, ys = [], []
    for l in [*planned.values(), *clusters.values()]:
        xs += [c[0] for c in l.coords]
        ys += [c[1] for c in l.coords]
    x0, x1, y0, y1 = min(xs) - 25, max(xs) + 70, min(ys) - 20, max(ys) + 20  # right margin holds the labels
    W, left, right = 129 / 25.4, 0.13, 0.97
    map_h = W * (right - left) * (y1 - y0) / (x1 - x0)
    prof_h, top, gap, bottom = 2.2, 0.1, 0.75, 0.55
    H = top + map_h + gap + prof_h + bottom
    fig = plt.figure(figsize=(W, H))
    ax = fig.add_axes([left, 1 - (top + map_h) / H, right - left, map_h / H])
    bx = fig.add_axes([left, bottom / H, right - left, prof_h / H])
    halo = [pe.withStroke(linewidth=2, foreground="white")]

    matched = set(pairing.values())
    # reserve the lower-left corner for the legend so no label lands under it
    label_taken = [Point(x0 + fx * (x1 - x0), y0 + fy * (y1 - y0)) for fx in (0.04, 0.16, 0.28, 0.4, 0.5) for fy in (0.04, 0.12, 0.2, 0.3)]
    for cid, l in clusters.items():
        if cid not in matched:
            ax.plot(*l.xy, color="0.65", lw=1.0, ls=(0, (1, 2)), zorder=2)
    for name, (x, y) in city_xy.items():
        ax.plot(x, y, "o", color="0.55", ms=2.5, zorder=1)
        ax.text(x + 6, y + 6, name, fontsize=6.5, color="0.4", zorder=1, path_effects=halo)
    dash = {0: (0, (6, 2)), 1: (0, (1, 1.4)), 2: (0, (6, 2, 1.2, 2)), 3: (0, (3, 1.5))}
    for i, (p, cid) in enumerate(pairing.items()):
        rx, ry = clusters[cid].xy
        ax.plot(rx, ry, color="0.3", lw=1.9, ls=dash[i % 4], zorder=3)
        others = [*planned.values(), *[l for k, l in clusters.items() if k != cid]]
        lx, ly, va = label_spot(clusters[cid], others, label_taken)
        ax.text(lx, ly, f"DV{cid}" if kind == "DV" else p, fontsize=6.5, style="italic", color="0.2", ha="center", va=va, path_effects=halo)
        px, py = planned[p].xy
        ax.plot(px, py, color="black", lw=2.4, zorder=4, solid_capstyle="round")
        ax.annotate("", xy=(px[-1], py[-1]), xytext=(px[-8], py[-8]), arrowprops=dict(arrowstyle="-|>", color="black", lw=0, mutation_scale=9), zorder=5)
        ax.text(px[-1] + 8, py[-1], p, fontsize=7.5, fontweight="bold", va="center")
        if fits.get(p):
            Va, Vb, *_ = fits[p]
            ax.plot(Va[:, 0], Va[:, 1], "s", color="black", ms=3.2, zorder=6)
            ax.plot(Vb[:, 0], Vb[:, 1], "o", mfc="white", mec="0.2", mew=0.9, ms=3.8, zorder=6)
    ax.set_xlim(x0, x1)
    ax.set_ylim(y0, y1)
    ax.set_aspect("equal")
    ax.set_xlabel("East of 29°E (km)")
    ax.set_ylabel("North of 50°N (km)")
    ax.grid(color="0.9", lw=0.5)
    handles = [Line2D([], [], color="black", lw=2.4, label="Planned line of advance"),
               Line2D([], [], color="0.3", lw=1.9, ls=(0, (6, 2)),
                      label="Matched cluster average path (DV)" if kind == "DV" else "Average path of the unit's own divisions"),
               Line2D([], [], marker="s", color="black", ls="", ms=3.2, label="Vector end points, planned"),
               Line2D([], [], marker="o", mfc="white", mec="0.2", ls="", ms=3.8, label="Vector end points, realized")]
    if kind == "DV" and set(clusters) - matched:
        handles.insert(2, Line2D([], [], color="0.65", lw=1.0, ls=(0, (1, 2)), label="Unmatched cluster"))
    ax.legend(handles=handles, loc="lower left", frameon=False, fontsize=6.5, handlelength=2.6)

    bx.axhspan(-NOISE_OFFSET_KM, NOISE_OFFSET_KM, color="0.9", lw=0)
    bx.axhline(0, color="black", lw=0.8)
    for i, (p, (sd, off, cid)) in enumerate(profiles.items()):
        bx.plot(sd, off, color="black", lw=1.7, ls=dash[i % 4], label=f"{p} vs cluster {cid}" if kind == "DV" else f"{p} vs its own divisions")
    bx.set_xlabel("Distance along the planned line (km)")
    bx.set_ylabel("Realized minus planned (km)\nnorth +, south −")
    h, _ = bx.get_legend_handles_labels()
    lo = min(float(off.min()) for _, off, _ in profiles.values())
    hi = max(float(off.max()) for _, off, _ in profiles.values())
    bx.set_ylim(lo - 62, hi + 8)  # empty strip under the data holds the legend
    bx.legend(handles=[*h, Patch(facecolor="0.9", label=f"±{NOISE_OFFSET_KM} km: within mapping error")], loc="lower left", frameon=False,
              fontsize=6.5, ncol=2, handlelength=3, columnspacing=1.2)
    bx.grid(axis="y", color="0.9", lw=0.5)
    for a_ in (ax, bx):
        for side in ("top", "right"):
            a_.spines[side].set_visible(False)
    fig.savefig(path.with_suffix(".pdf"))
    fig.savefig(path.with_suffix(".png"), dpi=600)
    plt.close(fig)


# ---------------------------------------------------------------- main
def main():
    OUT.mkdir(parents=True, exist_ok=True)
    planned = planned_lines()
    f = formations()
    flines = formation_lines()
    all_pairs, all_segs, all_members, all_spacing, all_costs, all_checks = [], [], [], [], [], []
    cols = ["planned", "cluster", "common_km", "frechet_km", "mean_signed_offset_km", "mean_abs_offset_km",
            "realized_within_50km_pct", "start_gap_km", "end_gap_km", "straight_bearing_diff", "unit_best_cluster", "membership_agrees"]
    runs = [(k, cluster_lines(n)) for k, n in CLUSTERINGS.items()] + [("UNIT", None)]
    for clustering, clusters in runs:
        if clustering == "UNIT":
            clusters, counts = unit_lines(f, flines)
            members, pairing = None, {u: u for u in clusters}
            print(f"\nformations behind each unit line: {counts}")
        else:
            members, pairing = membership_table(f, clustering), None
            check = reconstruction_check(f, flines, clusters, clustering)
            all_checks.append(check)
            assert check.mean_point_gap_km.max() < NOISE_OFFSET_KM, f"{clustering}: member paths no longer reproduce the stored average paths\n{check}"
            all_members.append(members)
        pairing, cost, pairs, segs, profiles, fits = compare(planned, clusters, members, clustering, pairing)
        all_pairs.append(pairs)
        all_segs.append(segs)
        if cost is not None:
            all_costs.append(cost.round(0).assign(clustering=clustering).reset_index().rename(columns={"index": "planned"}))
        all_spacing.append(spacing(planned, clusters, pairing).assign(clustering=clustering))
        if clustering in ("DV", "UNIT"):
            stem = "frontier_loa_comparison" if clustering == "DV" else "frontier_loa_units"
            draw(planned, clusters, pairing, profiles, fits, OUT / stem, clustering)
        print(f"\n=== {clustering}: planned line vs realized line (south to north) ===")
        print(pairs[[c for c in cols if c in pairs]].to_string(index=False))
    pd.concat(all_pairs).to_csv(OUT / "pairs.csv", index=False)
    pd.concat(all_segs).to_csv(OUT / "segments.csv", index=False)
    pd.concat(all_members).to_csv(OUT / "membership.csv", index=False)
    pd.concat(all_spacing).to_csv(OUT / "spacing.csv", index=False)
    pd.concat(all_costs).to_csv(OUT / "frechet_matrix.csv", index=False)
    pd.concat(all_checks).to_csv(OUT / "reconstruction_check.csv", index=False)
    print(f"\nWrote {OUT}")


if __name__ == "__main__":
    main()
