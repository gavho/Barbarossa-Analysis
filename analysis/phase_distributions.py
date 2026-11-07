"""Compare where the divisions were along the front in each stretch between AGS phase lines with the next stretch.

Every Wehrmacht/SS division location (Frontier_Points) is put in the stretch it lies in (same extended phase lines as
phase_clusters.py). Within a stretch, a location's position along the front is its north-south coordinate (km north of
50N in the equidistant projection; the phase lines run roughly north-south). Each consecutive pair of stretches is then
compared:
  shift_km        weighted mean position, later minus earlier (+ = the weight of the advance moved north)
  wasserstein_km  how far, on average, the distribution had to move to become the next one (0 = identical)
  hist_r          Pearson correlation of the two weighted histograms (BIN_KM bins): same shape and place -> near 1
  ks_D, ks_p      two-sample Kolmogorov-Smirnov test on one mean position per division, so samples are independent
  order_rho, _p   Spearman correlation of each division's position in both stretches: did divisions keep their order
                  along the front (rho near 1) or swap places?
Locations are weighted by fractional strength (Frac_Unit), so a 1/10 detachment counts a tenth of a division.

Natural breaks (Jenks), between the phase lines: within each stretch, each location's position ACROSS the stretch (0 at
the western phase line, 1 at the eastern one, measured at the location's latitude; km west of phase 1 before it) is split
into the fewest classes (2-5) that explain at least 80% of their variance (GVF >= 0.8). Breaks fall where few
division-days were spent - ground crossed quickly - so the classes are the bands between two phase lines where the
divisions bunched, and each break is a north-south curve that follows the two phase lines. Drawn on the app's map.

Usage: python analysis/phase_distributions.py   (writes analysis/phase_distributions/*)
"""
import json
import sys
from pathlib import Path

import geopandas as gpd
import matplotlib
import numpy as np
import pandas as pd
from pyproj import Transformer
from scipy.stats import ks_2samp, pearsonr, spearmanr, wasserstein_distance
from shapely.geometry import Point, Polygon
from shapely.ops import unary_union

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

sys.path.insert(0, str(Path(__file__).parent))
import compare_loa as c  # noqa: E402
import phase_clusters as pc  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "analysis" / "phase_distributions"
NATION_CODES = {1: "Wehrmacht", 2: "SS"}  # domain_Nation: 1 DE (Wehrmacht), 2 SS
BIN_KM = 25  # about the ~17 km position merging plus georeferencing error; finer bins would chart noise
MIN_DIVISIONS = 5  # below this a stretch has too few divisions to compare
GVF_MIN = 0.8  # Jenks: the fewest classes explaining at least 80% of the variance (the usual stopping rule)
BANDS = {2: ["near {w}", "near {e}"], 3: ["near {w}", "midway", "near {e}"],
         4: ["near {w}", "west of midway", "east of midway", "near {e}"],
         5: ["near {w}", "west of midway", "midway", "east of midway", "near {e}"]}  # west to east


def load_points():
    """Wehrmacht/SS division locations in km with their stretch index."""
    p = gpd.read_file(c.DATA / "Frontier_Points.geojson")
    p = p[p.Nation.isin(NATION_CODES)].copy()
    km = [c.to_km(g) for g in p.geometry]
    p["x"], p["y"] = [q.x for q in km], [q.y for q in km]
    lines = pc.phase_lines()
    p["zone"] = pc.zones(p[["x", "y"]].values, [pc.east_polygon(lines[l]) for l in lines])
    p["division"] = list(zip(p.Nation, p.Branch_Type, p.Num_Name))
    p["w"] = p.Frac_Unit.fillna(1.0)
    return p, pc.stretch_names(list(lines))


def compare(a, b):
    """Statistics for two stretches' locations (DataFrames with y, w, division)."""
    lo, hi = min(a.y.min(), b.y.min()), max(a.y.max(), b.y.max())
    bins = np.arange(lo - BIN_KM, hi + 2 * BIN_KM, BIN_KM)
    ha, _ = np.histogram(a.y, bins, weights=a.w)
    hb, _ = np.histogram(b.y, bins, weights=b.w)
    ma, mb = a.groupby("division").y.mean(), b.groupby("division").y.mean()
    both = ma.index.intersection(mb.index)
    ks = ks_2samp(ma, mb)
    rho = spearmanr(ma[both], mb[both]) if len(both) >= 3 else (np.nan, np.nan)
    return {
        "divisions_a": len(ma), "divisions_b": len(mb), "divisions_in_both": len(both),
        "shift_km": round(np.average(b.y, weights=b.w) - np.average(a.y, weights=a.w)),
        "wasserstein_km": round(wasserstein_distance(a.y, b.y, a.w, b.w)),
        "hist_r": round(pearsonr(ha, hb)[0], 2),
        "ks_D": round(ks.statistic, 2), "ks_p": round(ks.pvalue, 3),
        "order_rho": round(rho[0], 2), "order_p": round(rho[1], 3),
    }


def sentence(r):
    """One plain-language sentence for a pair of stretches, for readers who will not read the statistics.
    Shifts under compare_loa.NOISE_OFFSET_KM (20 km) are within mapping error; the r and rho bands are the usual
    strong / moderate / weak reading of a correlation."""
    line = r["to"].split("-")[0]
    shape = ("kept the same shape" if r["hist_r"] >= 0.7 else "changed shape somewhat" if r["hist_r"] >= 0.4
             else "took a different shape")
    shift = (f"its centre of weight moved about {abs(r['shift_km'])} km {'north' if r['shift_km'] > 0 else 'south'}"
             if abs(r["shift_km"]) >= c.NOISE_OFFSET_KM else "its centre of weight stayed put")
    order = ("divisions kept their places in line" if r["order_rho"] >= 0.8 else "divisions mostly kept their places"
             if r["order_rho"] >= 0.5 else "divisions changed places")
    fewer = r["divisions_a"] - r["divisions_b"]
    left = f"; {fewer} fewer divisions got past it" if fewer >= 5 else ""
    return f"Past phase {line} the line-up of divisions {shape}, {shift}, and {order}{left}."


def jenks(values, weights, k):
    """Weighted Fisher-Jenks natural breaks: split sorted 1-D values into k classes with the least weighted within-class
    sum of squares (exact, by dynamic programming). Returns (k-1 breaks, each midway between two classes; GVF), where
    GVF = 1 - within-class / total sum of squares."""
    o = np.argsort(values)
    v, w = np.asarray(values, float)[o], np.asarray(weights, float)[o]
    n = len(v)
    W, S, Q = (np.concatenate([[0], np.cumsum(a)]) for a in (w, w * v, w * v * v))
    cost, back = np.full((k + 1, n + 1), np.inf), np.zeros((k + 1, n + 1), int)
    cost[0, 0] = 0
    for cl in range(1, k + 1):
        for j in range(cl, n + 1):
            i = np.arange(cl - 1, j)
            t = cost[cl - 1, i] + Q[j] - Q[i] - (S[j] - S[i]) ** 2 / (W[j] - W[i])
            b = int(np.argmin(t))
            cost[cl, j], back[cl, j] = t[b], i[b]
    breaks, j = [], n
    for cl in range(k, 1, -1):
        i = back[cl, j]
        breaks.append((v[i - 1] + v[i]) / 2)
        j = i
    return sorted(breaks), 1 - cost[k, n] / (Q[n] - S[n] ** 2 / W[n])


def natural_breaks(y, w, gvf_min=GVF_MIN):
    """Fewest classes (2-5) whose GVF reaches gvf_min, the usual Jenks stopping rule. Returns (k, breaks, gvf)."""
    for k in range(2, 6):
        breaks, gvf = jenks(y, w, k)
        if gvf >= gvf_min:
            break
    return k, breaks, float(gvf)


def label_key(key, branch):
    """(Nation code, Branch code, Num) -> the (Nation, Branch, Number) key phase_clusters.label() reads."""
    return NATION_CODES[key[0]], branch[key[1]], key[2]


def line_x(line, ys):
    """East coordinate of a (north-south, extended) phase line at each latitude ys."""
    x, y = np.array(line).T
    o = np.argsort(y)
    return np.interp(ys, y[o], x[o])


def position(x, ys, z, lines, t=None):
    """Position across stretch z: 0..1 from its western to its eastern phase line at the same latitude; in the outer
    stretches, km from their one line (negative = west). With t given, the inverse: the east coordinate of position t."""
    L = list(lines)
    w = line_x(lines[L[z - 1]], ys) if z > 0 else None
    e = line_x(lines[L[z]], ys) if z < len(L) else None
    if w is not None and e is not None:
        return (x - w) / (e - w) if t is None else w + t * (e - w)
    ref = e if e is not None else w
    return x - ref if t is None else ref + t


def stretch_bands(g, z, lines, stretch):
    """Natural breaks across one stretch. Returns (bands, breaks, gvf, lon/lat features, km features); breaks and band
    limits are % of the way across (km from the line in the outer stretches)."""
    L, interior = list(lines), 0 < z < len(lines)
    t = position(g.x.values, g.y.values, z, lines)
    k, breaks, gvf = natural_breaks(t, g.w)
    cls = np.digitize(t, breaks)
    lo = t.min() if z == 0 else 0
    hi = t.max() if z == len(L) else (1 if z else 0)
    edges = [lo, *breaks, hi]
    w, e = ("the border" if z == 0 else f"phase {L[z - 1]}"), (f"phase {L[z]}" if z < len(L) else "the far east")
    ys = np.linspace(g.y.max() + 8, g.y.min() - 8, 30)  # north first
    inv = Transformer.from_crs(c.AEQD, 4326, always_xy=True)
    scale = 100 if interior else 1
    bands, ll, km = [], [], []
    for i in range(k):
        m = g[cls == i]
        band = {"band": BANDS[k][i].format(w=w, e=e), "share": round(100 * m.w.sum() / g.w.sum()), "divisions": m.division.nunique(),
                "from": round(edges[i] * scale), "to": round(edges[i + 1] * scale), "unit": "%" if interior else "km"}
        bands.append(band)
        ring = [*zip(position(None, ys, z, lines, edges[i]), ys), *zip(position(None, ys[::-1], z, lines, edges[i + 1]), ys[::-1])]
        ring.append(ring[0])
        props = {"stretch": stretch, **band}
        km.append({"type": "Feature", "properties": props, "geometry": {"type": "Polygon", "coordinates": [[[float(x), float(y)] for x, y in ring]]}})
        ll.append({"type": "Feature", "properties": props,
                   "geometry": {"type": "Polygon", "coordinates": [[[round(v, 4) for v in inv.transform(x, y)] for x, y in ring]]}})
    return bands, [round(b * scale) for b in breaks], gvf, ll, km


def latitude_ticks():
    """Axis ticks at whole degrees of latitude (km north at 29E, the projection's centre), each naming the towns at about
    that latitude. Towns alone would mislead: the axis is north-south only, and Kyiv is 400 km east of Lviv."""
    out = []
    for lat in range(48, 52):
        near = [n for n, (la, _) in c.CITIES.items() if round(la) == lat]
        out.append({"name": f"{lat}°N" + (f" ({', '.join(near)})" if near else ""), "km": round(c.to_km(Point(29, lat)).y)})
    return out


def draw(profiles, positions, bins, towns):
    """Paper figures, black and white: front profile per stretch, and each division's place along the front."""
    mid = (bins[:-1] + bins[1:]) / 2
    fig, axes = plt.subplots(1, len(profiles), figsize=(2.3 * len(profiles), 5.2), sharey=True)
    for i, (ax, r) in enumerate(zip(axes, profiles)):
        if i:
            ax.plot(profiles[i - 1]["share"], mid, color="0.6", lw=1, ls="--", label="previous stretch")
        ax.fill_betweenx(mid, 0, r["share"], color="0.25", step=None)
        ax.axhline(r["mean_km"], color="black", lw=1.5)
        ax.set_title(r["stretch"].replace("-", " → "), fontsize=9)
        ax.set_xticks([])
    axes[0].set_yticks([t["km"] for t in towns], [t["name"] for t in towns], fontsize=8)
    axes[1].legend(fontsize=7, loc="lower right", frameon=False)
    fig.suptitle("Where along the front the divisions were (solid line: centre of weight)", fontsize=10)
    fig.tight_layout()
    for ext in ("png", "pdf"):
        fig.savefig(OUT / f"front_profile.{ext}", dpi=200)
    plt.close(fig)

    order = [r["stretch"] for r in profiles]
    pos = pd.DataFrame(positions).pivot(index="division", columns="stretch", values="km")[order]
    fig, ax = plt.subplots(figsize=(7, 5.2))
    for _, row in pos.iterrows():
        ax.plot(range(len(order)), row.values, color="0.35", lw=0.8, marker="o", ms=2)
    ax.set_xticks(range(len(order)), [s.replace("-", " → ") for s in order], fontsize=8)
    ax.set_yticks([t["km"] for t in towns], [t["name"] for t in towns], fontsize=8)
    ax.set_title("Each division's average place along the front, stretch by stretch\n(lines that stay apart = divisions kept their order)", fontsize=10)
    fig.tight_layout()
    for ext in ("png", "pdf"):
        fig.savefig(OUT / f"places_in_line.{ext}", dpi=200)
    plt.close(fig)


PLANNED = {"1": "1941-06-30", "2": "1941-07-07", "3": "1941-07-22", "4": "1941-07-25", "5": "1941-07-30"}  # agreed 11-6-2026


LINK_KM = 30  # a group: divisions within 30 km of a neighbour (1.5x the 20 km mapping error), about corps-sized
SURFACE_KM = LINK_KM / 2  # density smoothing, and the radius of the circles whose union outlines a group
GRID_KM = 5
LEVELS = [0.35, 1, 2, 4]  # density bands, divisions per 1,000 km2; the lowest is half a lone division's peak (0.71)
JENKS_GVF = 0.9  # natural breaks on the planned dates: the fewest classes explaining 90% (Sorin expected 3 or 4 bands)


def link_groups(xy, link_km=LINK_KM):
    """One label per division: divisions within link_km of each other, directly or through a chain of neighbours, share a
    label (connected components). Nothing else is imposed: no number of groups, no phase line. (Tried before: Jenks and
    then a density on one west-east axis; both lumped divisions 300 km apart along the front into one main body.)"""
    from scipy.sparse.csgraph import connected_components
    from scipy.spatial.distance import cdist
    return connected_components(cdist(xy, xy) <= link_km, directed=False)[1]


def classify_bins(bins, past):
    """Per group: past (all its divisions past the phase line), behind (none), straddling (both sides)."""
    out = {}
    for b in np.unique(bins):
        on = past[bins == b]
        out[int(b)] = "past" if on.all() else "behind" if not on.any() else "straddling"
    return out


def surface_bands(xy, h=SURFACE_KM):
    """Kernel density of divisions (Gaussian bumps of width h on a GRID_KM grid, in divisions per 1,000 km2), as one
    shapely region (km) per level in LEVELS: where the density is at least that level."""
    gx = np.arange(xy[:, 0].min() - 3 * h, xy[:, 0].max() + 3 * h, GRID_KM)
    gy = np.arange(xy[:, 1].min() - 3 * h, xy[:, 1].max() + 3 * h, GRID_KM)
    X, Y = np.meshgrid(gx, gy)
    Z = sum(np.exp(-((X - a) ** 2 + (Y - b) ** 2) / (2 * h * h)) for a, b in xy) / (2 * np.pi * h * h) * 1000
    fig, ax = plt.subplots()
    out = {}
    for lev in LEVELS:
        if Z.max() <= lev:
            continue
        rings = ax.contourf(X, Y, Z, levels=[lev, Z.max() + 1]).get_paths()[0].to_polygons()
        region = Polygon()
        for r in rings:  # outer rings and holes alike: even-odd fill
            region = region.symmetric_difference(Polygon(r).buffer(0))
        out[lev] = region
    plt.close(fig)
    return out


def jenks_on_date():
    """Sorin's natural breaks (11-6): on each phase's planned date, the divisions on one line along the general direction of
    the whole advance (mean 22 June position -> mean last position), cut by Jenks at the fewest classes explaining
    JENKS_GVF of the spread. Only then is each bin read against the phase line: past (all its divisions), straddling
    (some) or behind (none). Bins are numbered from the front (1 = furthest along). Returns (bins table, per-phase
    summary, plot data, app dots, app break lines, heading)."""
    import phase_checkpoints as ck
    tracks, lines, names = ck.daily_tracks(), pc.phase_lines(), pc.unit_names()
    inv = Transformer.from_crs(c.AEQD, 4326, always_xy=True)
    first = np.mean([t.iloc[0][["x", "y"]].to_numpy(float) for t in tracks.values()], axis=0)
    last = np.mean([t.iloc[-1][["x", "y"]].to_numpy(float) for t in tracks.values()], axis=0)
    u = (last - first) / np.linalg.norm(last - first)
    across = np.array([-u[1], u[0]])
    heading = round(c.bearing(first, last))
    lonlat = lambda q: [round(v, 5) for v in inv.transform(*q)]
    rows, summary, plots, dots, breaklines = [], [], [], [], []
    for L, day in PLANNED.items():
        d = (pd.Timestamp(day, tz=ck.DAY0.tz) - ck.DAY0).days
        keys = [k for k, t in tracks.items() if (t.day == d).any()]
        xy = np.array([tracks[k].loc[tracks[k].day == d, ["x", "y"]].iloc[0].to_numpy(float) for k in keys])
        if len(xy) < MIN_DIVISIONS:
            continue
        along = (xy - first) @ u
        poly = pc.east_polygon(lines[L])
        past = np.array([poly.contains(Point(q)) for q in xy])
        k, breaks, gvf = natural_breaks(along, np.ones(len(along)), JENKS_GVF)
        bins = k - np.digitize(along, breaks)  # 1 = the bin furthest along the advance
        cls = classify_bins(bins, past)
        for b, kind in sorted(cls.items()):
            m = bins == b
            rows.append({"phase": L, "date": day, "bin": b, "from_km": round(float(along[m].min())), "to_km": round(float(along[m].max())),
                         "divisions": int(m.sum()), "past": int(past[m].sum()), "class": kind})
        share = {kind: round(100 * sum((bins == b).sum() for b, x in cls.items() if x == kind) / len(along)) for kind in ("past", "straddling", "behind")}
        line_along = (np.array(lines[L][1:-1]) - first) @ u  # the drawn phase line, without its extensions
        summary.append({"phase": L, "date": day, "divisions": len(along), "bins": k, "gvf": round(gvf, 2), **share,
                        "line_from": round(float(line_along.min())), "line_to": round(float(line_along.max()))})
        side = (xy - first) @ across
        for b in breaks:  # each break as a straight line across the front, at right angles to the advance
            ends = [first + b * u + w * across for w in (side.min() - 30, side.max() + 30)]
            breaklines.append({"type": "Feature", "properties": {"phase": L, "km": round(b)},
                               "geometry": {"type": "LineString", "coordinates": [lonlat(e) for e in ends]}})
        for key, q, a, b, on in zip(keys, xy, along, bins, past):
            dots.append({"type": "Feature", "properties": {"division": pc.label(key, names), "phase": L, "date": day, "bin": int(b),
                                                           "class": cls[int(b)], "km": round(float(a)), "past": bool(on)},
                         "geometry": {"type": "Point", "coordinates": lonlat(q)}})
        plots.append((L, day, along, past, breaks, bins, (line_along.min(), line_along.max()), k, gvf))
    return pd.DataFrame(rows), pd.DataFrame(summary), plots, dots, breaklines, heading


def draw_jenks(plots, heading):
    """One strip per phase: the divisions along the general direction of advance (filled = past the phase line, open =
    short of it), the natural breaks dashed with bin numbers from the front, the phase line's span shaded."""
    plt.rcParams.update({"font.size": 7, "pdf.fonttype": 42})
    fig, axes = plt.subplots(len(plots), 1, figsize=(129 / 25.4, 0.8 * len(plots) + 0.6), sharex=True)
    for ax, (L, day, along, past, breaks, bins, (lo, hi), k, gvf) in zip(np.atleast_1d(axes), plots):
        ax.axvspan(lo, hi, color="0.88", lw=0)
        jitter = np.random.default_rng(0).uniform(-0.3, 0.3, len(along))
        ax.scatter(along[past], jitter[past], s=9, c="black", lw=0)
        ax.scatter(along[~past], jitter[~past], s=9, facecolors="white", edgecolors="black", lw=0.5)
        for b in breaks:
            ax.axvline(b, color="black", lw=0.8, ls=(0, (3, 2)))
        for b in range(1, k + 1):
            ax.text(along[bins == b].mean(), 0.42, str(b), ha="center", fontsize=7, fontweight="bold")
        ax.set_yticks([])
        ax.set_ylim(-0.5, 0.55)
        ax.set_ylabel(f"Phase {L}\n{pd.Timestamp(day):%d %b}\n{k} bins, {gvf:.0%}", rotation=0, ha="right", va="center", fontsize=7)
        ax.spines[["top", "right", "left"]].set_visible(False)
    np.atleast_1d(axes)[-1].set_xlabel(f"km along the general direction of advance (bearing {heading}°) from the 22 June average position")
    fig.text(0.01, 0.005, "Filled = past the phase line · open = short · dashed = natural break · grey = phase line", fontsize=7)
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    for ext in ("pdf", "png"):
        fig.savefig(OUT / f"jenks_by_phase.{ext}", dpi=300)
    plt.close(fig)


def shapely_to_lonlat(geom, inv):
    """A shapely geometry in km as a GeoJSON geometry in lon/lat (5 decimals)."""
    from shapely.geometry import mapping
    from shapely.ops import transform
    return mapping(transform(lambda x, y, z=None: tuple(np.round(inv.transform(x, y), 5)), geom))


def fresh_ids(ids, keys, prev, next_id):
    """follow_groups may hand a new group an id last used days ago; here an id only ever continues yesterday's group.
    A group sharing no division with yesterday's group of the same id gets the next unused id. -1 (lone) is left alone."""
    fresh = {}
    for i in sorted(set(ids[ids >= 0])):
        if not any(prev.get(k) == i for k, j in zip(keys, ids) if j == i):
            fresh[i], next_id = next_id, next_id + 1
        else:
            next_id = max(next_id, i + 1)
    return np.array([fresh.get(i, i) for i in ids]), next_id


def daily_groups():
    """The same grouping (link_groups) on every day, so the groups can be followed through time. A group keeps its id from
    one day to the next when it shares most divisions with yesterday's group (phase_clusters.follow_groups), so a split, a
    merge or a new group shows as a change of id. Returns (groups table, links between consecutive days, app features)."""
    import phase_checkpoints as ck
    tracks, names = ck.daily_tracks(), pc.unit_names()
    roster = c.roster(c.formations())
    form = lambda k: roster.get("|".join(map(str, k)), "other")
    inv = Transformer.from_crs(c.AEQD, 4326, always_xy=True)
    ll = lambda g: shapely_to_lonlat(g, inv)
    rows, links, dots, outlines, surface = [], [], [], [], []
    prev, prev_date, next_id = {}, None, 0
    for d in sorted({int(x) for t in tracks.values() for x in t.day}):
        keys = [k for k, t in tracks.items() if (t.day == d).any()]
        if len(keys) < MIN_DIVISIONS:
            continue
        date = (ck.DAY0 + pd.Timedelta(days=d)).strftime("%Y-%m-%d")
        xy = np.array([tracks[k].loc[tracks[k].day == d, ["x", "y"]].iloc[0].to_numpy(float) for k in keys])
        lab = link_groups(xy)
        grouped = np.array([(lab == g).sum() > 1 for g in lab])
        gk = [k for k, on in zip(keys, grouped) if on]
        ids = np.full(len(keys), -1)
        if grouped.any():
            first = np.unique(lab[grouped], return_inverse=True)[1]
            ids[grouped] = pc.follow_groups(first, gk, prev)
        ids, next_id = fresh_ids(ids, keys, prev, next_id)
        today = {k: int(i) for k, i in zip(keys, ids) if i >= 0}
        for i in sorted(set(today.values())):
            m = ids == i
            counts = {f: n for f in ck.FORMATIONS + ["other"] if (n := sum(form(k) == f for k, mm in zip(keys, m) if mm))}
            top, n_top = max(counts.items(), key=lambda x: x[1])
            dominant = top if n_top > m.sum() / 2 else "mixed"
            rows.append({"date": date, "id": i, "divisions": int(m.sum()), "dominant": dominant,
                         "formations": ", ".join(f"{f} {n}" for f, n in sorted(counts.items(), key=lambda x: -x[1])),
                         "y": round(float(xy[m, 1].mean())), "members": "; ".join(sorted(pc.label(k, names) for k, mm in zip(keys, m) if mm))})
            outlines.append({"type": "Feature", "properties": {"date": date, "group": i, "colour": i % 8 + 1, "divisions": int(m.sum()),
                                                              "label": f"{i + 1} · {m.sum()}", "dominant": dominant},
                             "geometry": ll(unary_union([Point(q).buffer(SURFACE_KM) for q in xy[m]]).simplify(1))})
        for k, q, i in zip(keys, xy, ids):
            dots.append({"type": "Feature", "properties": {"date": date, "division": pc.label(k, names), "group": int(i),
                                                           "colour": int(i) % 8 + 1 if i >= 0 else 0, "formation": form(k)},
                         "geometry": {"type": "Point", "coordinates": [round(v, 5) for v in inv.transform(*q)]}})
        for lev, region in surface_bands(xy).items():
            surface.append({"type": "Feature", "properties": {"date": date, "level": lev}, "geometry": ll(region.simplify(2))})
        if prev_date:
            pairs = pd.Series([(prev[k], today[k]) for k in today if k in prev]).value_counts()
            links += [{"from_date": prev_date, "from_id": a, "to_date": date, "to_id": b, "divisions": int(n)} for (a, b), n in pairs.items()]
        prev, prev_date = today, date
    return pd.DataFrame(rows), pd.DataFrame(links), dots, outlines, surface


def draw_daily(groups, links, step=2):
    """Black-and-white flow over time: a bar per group every `step` days (height = divisions, north at top), and grey
    bands for the divisions that stayed together from one sampled day to the next. Splits and merges show as bands fanning
    out or in."""
    plt.rcParams.update({"font.size": 7, "pdf.fonttype": 42})
    days = sorted(groups.date.unique())[::step]
    life = groups.groupby("id").date.size()
    lasting = set(life[life >= 10].index)  # groups that held together for 10+ days carry the story; the rest fade back
    fig, ax = plt.subplots(figsize=(129 / 25.4, 3.2))
    pos, gap = {}, 2.0
    for j, day in enumerate(days):
        top = 0.0
        for r in groups[groups.date == day].sort_values("y", ascending=False).itertuples():
            pos[(day, r.id)] = [j, top, r.divisions, 0.0, 0.0]  # column, top, height, used out, used in
            ax.add_patch(plt.Rectangle((j - 0.12, top), 0.24, r.divisions, fc="black" if r.id in lasting else "0.55", lw=0))
            top += r.divisions + gap
    member = {(r.date, r.id): set(r.members.split("; ")) for r in groups.itertuples()}
    for a, b in zip(days, days[1:]):
        for ka in [k for k in pos if k[0] == a]:
            for kb in [k for k in pos if k[0] == b]:
                n = len(member[ka] & member[kb])
                if not n:
                    continue
                pa, pb = pos[ka], pos[kb]
                y0, y1 = pa[1] + pa[3], pb[1] + pb[4]
                pa[3] += n
                pb[4] += n
                xs = np.linspace(pa[0] + 0.12, pb[0] - 0.12, 30)
                t = (xs - xs[0]) / (xs[-1] - xs[0])
                ease = t * t * (3 - 2 * t)
                lo = y0 + (y1 - y0) * ease
                same = ka[1] == kb[1] and ka[1] in lasting
                ax.fill_between(xs, lo, lo + n, color="0.55" if same else "0.85", alpha=0.7, lw=0)
    for i in lasting:  # label each lasting group where it ends
        last = max((k for k in pos if k[1] == i), key=lambda k: pos[k][0], default=None)
        if last:
            dom = groups[groups.id == i].dominant.mode()[0].replace("other", "unidentified")
            ax.text(pos[last][0] + 0.2, pos[last][1] + pos[last][2] / 2, dom, fontsize=7, va="center", fontweight="bold",
                    bbox={"fc": "white", "ec": "none", "pad": 0.6})
    ax.set_xticks(range(len(days)), [pd.Timestamp(d).strftime("%d %b") if i % 3 == 0 else "" for i, d in enumerate(days)])
    ax.invert_yaxis()
    ax.set_yticks([])
    ax.spines[["top", "right", "left"]].set_visible(False)
    fig.text(0.01, 0.01, f"Bars: groups (within {LINK_KM} km of a neighbour) every {step} days · north at top · height = divisions\n"
             "Dark: held together 10+ days, labelled by main formation · light: short-lived", fontsize=7)
    ax.set_xlim(-0.5, len(days) + 1.2)  # room for the labels at the right
    fig.tight_layout(rect=(0, 0.07, 1, 1))
    for ext in ("pdf", "png"):
        fig.savefig(OUT / f"groups_daily.{ext}", dpi=300)
    plt.close(fig)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    p, stretches = load_points()
    groups = {z: g for z, g in p.groupby("zone") if g.division.nunique() >= MIN_DIVISIONS}
    print(f"{len(p)} Wehrmacht/SS locations; divisions per stretch: "
          + ", ".join(f"{stretches[z]} {g.division.nunique()}" for z, g in groups.items()))

    summary = pd.DataFrame([{"stretch": stretches[z], "locations": len(g), "divisions": g.division.nunique(),
                             "mean_km_north": round(np.average(g.y, weights=g.w)),
                             "sd_km": round(np.sqrt(np.cov(g.y, aweights=g.w))),
                             "first_day": g.Date.min().date(), "last_day": g.Date.max().date()} for z, g in groups.items()])
    zs = sorted(groups)
    pairs = pd.DataFrame([{"from": stretches[a], "to": stretches[b], **compare(groups[a], groups[b])}
                          for a, b in zip(zs, zs[1:]) if b == a + 1])
    pairs["sentence"] = [sentence(r) for r in pairs.to_dict("records")]
    summary.to_csv(OUT / "stretch_summary.csv", index=False)
    pairs.to_csv(OUT / "consecutive_pairs.csv", index=False)
    print("\n" + summary.to_string(index=False) + "\n\n" + pairs.to_string(index=False))

    lines = pc.phase_lines()
    bins = np.arange(np.floor(p.y.min() / BIN_KM) * BIN_KM, p.y.max() + BIN_KM, BIN_KM)
    profiles, positions, zones_km = [], [], []
    names, branch = pc.unit_names(), pd.read_csv(c.DATA / "domain_Branch_Type.csv").set_index("Code").Label.to_dict()
    for z in zs:
        g = groups[z]
        bands, breaks, gvf, ll, km = stretch_bands(g, z, lines, stretches[z])
        zones_km += km
        h, _ = np.histogram(g.y, bins, weights=g.w)
        profiles.append({"stretch": stretches[z], "share": [round(float(v), 4) for v in h / h.sum()],
                         "mean_km": round(np.average(g.y, weights=g.w)), "breaks": breaks, "gvf": round(gvf, 2), "bands": bands})
        for key, y in g.groupby("division").y.mean().items():
            positions.append({"division": pc.label(label_key(key, branch), names), "stretch": stretches[z], "km": round(y)})
    towns = latitude_ticks()
    pd.DataFrame([{"stretch": r["stretch"], "classes": len(r["bands"]), "gvf": r["gvf"], **b} for r in profiles for b in r["bands"]]) \
        .to_csv(OUT / "natural_breaks.csv", index=False)
    draw(profiles, positions, bins, towns)
    (OUT / "natural_zones.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": zones_km}), encoding="utf8")  # km, for phase_checkpoints maps
    jenks_t, by_phase, plots, jdots, jlines, heading = jenks_on_date()
    jenks_t.to_csv(OUT / "jenks_by_phase.csv", index=False)
    by_phase.to_csv(OUT / "jenks_by_phase_summary.csv", index=False)
    draw_jenks(plots, heading)
    # The app's Phases tab shows the sentence, with the numbers on request.
    (ROOT / "app" / "src" / "data" / "phase_distributions.json").write_text(pairs.to_json(orient="records"), encoding="utf8")
    (ROOT / "app" / "src" / "data" / "phase_profiles.json").write_text(json.dumps({
        "bin_km": BIN_KM, "bins_from_km": float(bins[0]), "towns": towns, "profiles": profiles, "positions": positions,
        "jenks": {"heading": heading, "gvf_min": JENKS_GVF, "summary": by_phase.to_dict("records"), "bins": jenks_t.to_dict("records"),
                  **{name: {"type": "FeatureCollection", "features": [{**f, "id": i} for i, f in enumerate(fc)]}
                     for name, fc in (("dots", jdots), ("breaklines", jlines))}},
    }, separators=(",", ":")), encoding="utf8")
    print("\n" + "\n".join(pairs.sentence))
    print(f"\nNatural breaks on each planned date (bearing {heading} deg, fewest bins explaining {JENKS_GVF:.0%}):\n"
          + by_phase.to_string(index=False) + "\n\n" + jenks_t.to_string(index=False))
    daily, daily_links, ddots, doutlines, dsurface = daily_groups()
    daily.to_csv(OUT / "groups_daily.csv", index=False)
    daily_links.to_csv(OUT / "groups_daily_links.csv", index=False)
    draw_daily(daily, daily_links)
    (ROOT / "app" / "src" / "data" / "local_groups.json").write_text(json.dumps({
        "link_km": LINK_KM, "groups": daily.drop(columns=["members"]).to_dict("records"), "links": daily_links.to_dict("records"),
        **{name: {"type": "FeatureCollection", "features": [{**f, "id": i} for i, f in enumerate(fc)]}
           for name, fc in (("dots", ddots), ("outlines", doutlines), ("surface", dsurface))},
    }, separators=(",", ":")), encoding="utf8")
    print(f"\nDaily groups: {daily.date.nunique()} days, {daily.groupby('date').size().median():.0f} groups a day (median)")
    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()
