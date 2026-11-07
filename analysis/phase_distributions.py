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
the western phase line, 1 at the eastern one, measured at the location's latitude; km west of line A before it) is split
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
from shapely.geometry import Point

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
    return f"Past line {line} the line-up of divisions {shape}, {shift}, and {order}{left}."


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


def natural_breaks(y, w):
    """Fewest classes (2-5) whose GVF reaches GVF_MIN, the usual Jenks stopping rule. Returns (k, breaks, gvf)."""
    for k in range(2, 6):
        breaks, gvf = jenks(y, w, k)
        if gvf >= GVF_MIN:
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
    w, e = ("the border" if z == 0 else L[z - 1]), (L[z] if z < len(L) else "the far east")
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


PLANNED = {"A": "1941-06-30", "B": "1941-07-07", "C": "1941-07-22", "D": "1941-07-25", "E": "1941-07-30"}  # agreed 11-6-2026


def classify_bins(bins, past):
    """Per natural-break bin: past (all its divisions past the phase line), behind (none), straddling (both sides)."""
    out = {}
    for b in np.unique(bins):
        on = past[bins == b]
        out[int(b)] = "past" if on.all() else "behind" if not on.any() else "straddling"
    return out


def breaks_by_phase():
    """Sorin's 11-6 version of natural breaks: on each phase line's planned date, every division's position projected on
    one axis along the general bearing of the whole advance (mean 22 June position -> mean last position), split by
    Jenks; then each bin is read against the phase line. Returns (bins table, per-phase summary, plot data)."""
    import phase_checkpoints as ck
    tracks, lines = ck.daily_tracks(), pc.phase_lines()
    first = np.mean([t.iloc[0][["x", "y"]].to_numpy(float) for t in tracks.values()], axis=0)
    last = np.mean([t.iloc[-1][["x", "y"]].to_numpy(float) for t in tracks.values()], axis=0)
    u = (last - first) / np.linalg.norm(last - first)
    heading = round(c.bearing(first, last))
    rows, summary, plots = [], [], []
    for L, day in PLANNED.items():
        d = (pd.Timestamp(day, tz=ck.DAY0.tz) - ck.DAY0).days
        xy = np.array([t.loc[t.day == d, ["x", "y"]].iloc[0].to_numpy(float) for t in tracks.values() if (t.day == d).any()])
        if len(xy) < MIN_DIVISIONS:
            continue
        along = (xy - first) @ u
        poly = pc.east_polygon(lines[L])
        past = np.array([poly.contains(Point(q)) for q in xy])
        k, breaks, gvf = natural_breaks(along, np.ones(len(along)))
        bins = np.digitize(along, breaks)
        cls = classify_bins(bins, past)
        for b, kind in cls.items():
            m = bins == b
            rows.append({"phase": L, "date": day, "bearing": heading, "bin": b + 1, "from_km": round(along[m].min()),
                         "to_km": round(along[m].max()), "divisions": int(m.sum()), "past_line": int(past[m].sum()), "class": kind})
        share = {kind: round(100 * sum((bins == b).sum() for b, x in cls.items() if x == kind) / len(along))
                 for kind in ("past", "straddling", "behind")}
        line_along = (np.array([q for q in lines[L][1:-1]]) - first) @ u  # the drawn line, without its extensions
        summary.append({"phase": L, "date": day, "divisions": len(along), "classes": k, "gvf": round(gvf, 2), **share})
        plots.append((L, day, along, past, breaks, (line_along.min(), line_along.max())))
    return pd.DataFrame(rows), pd.DataFrame(summary), plots, heading


def draw_breaks(plots, heading):
    """One strip per phase: divisions along the general bearing, breaks as ticks, the phase line's span shaded."""
    plt.rcParams.update({"font.size": 8, "pdf.fonttype": 42})
    fig, axes = plt.subplots(len(plots), 1, figsize=(129 / 25.4, 0.75 * len(plots) + 0.5), sharex=True)
    for ax, (L, day, along, past, breaks, (lo, hi)) in zip(np.atleast_1d(axes), plots):
        ax.axvspan(lo, hi, color="0.88", lw=0)
        jitter = np.random.default_rng(0).uniform(-0.25, 0.25, len(along))
        ax.scatter(along[past], jitter[past], s=10, c="black", lw=0)
        ax.scatter(along[~past], jitter[~past], s=10, facecolors="white", edgecolors="black", lw=0.6)
        for b in breaks:
            ax.axvline(b, color="black", lw=0.8, ls=(0, (3, 2)))
        ax.set_yticks([])
        ax.set_ylim(-0.5, 0.5)
        ax.set_ylabel(f"Phase {L}\n{pd.Timestamp(day):%d %b}", rotation=0, ha="right", va="center")
        ax.spines[["top", "right", "left"]].set_visible(False)
    np.atleast_1d(axes)[-1].set_xlabel(f"km along the general direction of advance (bearing {heading}°)")
    fig.text(0.01, 0.005, "Filled = past the phase line, open = short of it, dashed = natural break, grey = phase line span", fontsize=7)
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    for ext in ("pdf", "png"):
        fig.savefig(OUT / f"breaks_by_phase.{ext}", dpi=300)
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
    profiles, positions, zones_ll, zones_km = [], [], [], []
    names, branch = pc.unit_names(), pd.read_csv(c.DATA / "domain_Branch_Type.csv").set_index("Code").Label.to_dict()
    for z in zs:
        g = groups[z]
        bands, breaks, gvf, ll, km = stretch_bands(g, z, lines, stretches[z])
        zones_ll += ll
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
    # The app's Phases tab shows the sentence, with the numbers on request.
    (ROOT / "app" / "src" / "data" / "phase_distributions.json").write_text(pairs.to_json(orient="records"), encoding="utf8")
    (ROOT / "app" / "src" / "data" / "phase_profiles.json").write_text(json.dumps({
        "bin_km": BIN_KM, "bins_from_km": float(bins[0]), "towns": towns, "profiles": profiles, "positions": positions,
        "zones": {"type": "FeatureCollection", "features": [{**f, "id": i} for i, f in enumerate(zones_ll)]},
    }, separators=(",", ":")), encoding="utf8")
    print("\n" + "\n".join(pairs.sentence))
    bins_t, by_phase, plots, heading = breaks_by_phase()
    bins_t.to_csv(OUT / "breaks_by_phase.csv", index=False)
    by_phase.to_csv(OUT / "breaks_by_phase_summary.csv", index=False)
    draw_breaks(plots, heading)
    print(f"\nNatural breaks along the general bearing ({heading} deg) on each planned date:\n" + by_phase.to_string(index=False))
    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()
