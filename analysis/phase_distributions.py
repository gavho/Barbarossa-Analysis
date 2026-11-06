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

Natural breaks (Jenks): within each stretch, the north-south positions are split into the fewest classes (2-5) that
explain at least 80% of their variance (GVF >= 0.8). Breaks fall where few division-days were spent, so the classes are
the sectors of the front where divisions bunched (front profile chart, and the Checkpoints cards).

Natural phase lines (Jenks on the east-west axis): all locations' east positions are split into as many stretches as the
plan has, so the breaks are north-south lines where the advance moved fast between two places it bunched; each is set
beside the nearest planned phase line. Drawn on the app's map.

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
SECTORS = {2: ["northern", "southern"], 3: ["northern", "central", "southern"],
           4: ["northern", "north-central", "south-central", "southern"],
           5: ["northern", "north-central", "central", "south-central", "southern"]}


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


def natural_lines(p, lines):
    """Natural phase lines: Jenks on how far east every division location was (km, weighted by strength), split into as
    many stretches as the plan has (one break per planned line). Breaks fall where few division-days were spent - ground
    crossed quickly - so each break is a north-south line between two places the advance bunched. Breaks and planned
    lines are paired in order, west to east (1st with A, ...); gap = mean east-west distance over the data's north-south span. Returns (lon/lat features, km
    features, breaks, gvf)."""
    breaks, gvf = jenks(p.x, p.w, len(lines) + 1)
    ys = np.linspace(p.y.min(), p.y.max(), 25)
    planned = {}
    for L, ln in lines.items():
        x, y = np.array(ln).T
        o = np.argsort(y)
        planned[L] = np.interp(ys, y[o], x[o])
    inv = Transformer.from_crs(c.AEQD, 4326, always_xy=True)
    ll, km = [], []
    for i, (b, L) in enumerate(zip(breaks, sorted(planned, key=lambda L: planned[L].mean()))):
        props = {"name": f"N{i + 1}", "km_east": round(b), "planned": L, "gap_km": round(float(np.mean(np.abs(b - planned[L])))),
                 "west_of_plan": bool(b < planned[L].mean())}
        coords = [(b, y) for y in np.linspace(p.y.max() + 8, p.y.min() - 8, 20)]  # north end first, like the phase lines
        ll.append({"type": "Feature", "properties": props,
                   "geometry": {"type": "LineString", "coordinates": [[round(v, 4) for v in inv.transform(x, y)] for x, y in coords]}})
        km.append({"type": "Feature", "properties": props, "geometry": {"type": "LineString", "coordinates": coords}})
    return ll, km, breaks, float(gvf)


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
        for b in r["breaks_km"]:
            ax.axhline(b, color="black", lw=0.8, ls=":")
        ax.set_title(r["stretch"].replace("-", " → "), fontsize=9)
        ax.set_xticks([])
    axes[0].set_yticks([t["km"] for t in towns], [t["name"] for t in towns], fontsize=8)
    axes[1].legend(fontsize=7, loc="lower right", frameon=False)
    fig.suptitle("Where along the front the divisions were (solid line: centre of weight; dotted: natural breaks)", fontsize=10)
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
    profiles, positions = [], []
    names, branch = pc.unit_names(), pd.read_csv(c.DATA / "domain_Branch_Type.csv").set_index("Code").Label.to_dict()
    for z in zs:
        g = groups[z]
        k, breaks, gvf = natural_breaks(g.y, g.w)
        h, _ = np.histogram(g.y, bins, weights=g.w)
        cls = np.digitize(g.y, breaks)
        sectors = []
        for i in reversed(range(k)):  # classes run south to north (ascending km); list them north first
            m = g[cls == i]
            sectors.append({"sector": SECTORS[k][k - 1 - i], "share": round(100 * m.w.sum() / g.w.sum()), "divisions": m.division.nunique(),
                            "from_km": round(m.y.min()), "to_km": round(m.y.max())})
        profiles.append({"stretch": stretches[z], "share": [round(float(v), 4) for v in h / h.sum()],
                         "mean_km": round(np.average(g.y, weights=g.w)), "breaks_km": [round(b) for b in breaks],
                         "gvf": round(gvf, 2), "sectors": sectors})
        for key, y in g.groupby("division").y.mean().items():
            positions.append({"division": pc.label(label_key(key, branch), names), "stretch": stretches[z], "km": round(y)})
    towns = latitude_ticks()
    pd.DataFrame([{"stretch": r["stretch"], "classes": len(r["sectors"]), "gvf": r["gvf"], **s} for r in profiles for s in r["sectors"]]) \
        .to_csv(OUT / "natural_breaks.csv", index=False)
    draw(profiles, positions, bins, towns)
    nat_ll, nat_km, nat_breaks, nat_gvf = natural_lines(p, lines)
    pd.DataFrame([f["properties"] for f in nat_ll]).assign(gvf=round(nat_gvf, 2)).to_csv(OUT / "natural_lines.csv", index=False)
    (OUT / "natural_lines.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": nat_km}), encoding="utf8")  # km, for phase_checkpoints maps
    # The app's Phases tab shows the sentence, with the numbers on request.
    (ROOT / "app" / "src" / "data" / "phase_distributions.json").write_text(pairs.to_json(orient="records"), encoding="utf8")
    (ROOT / "app" / "src" / "data" / "phase_profiles.json").write_text(json.dumps({
        "bin_km": BIN_KM, "bins_from_km": float(bins[0]), "towns": towns, "profiles": profiles, "positions": positions,
        "natural_gvf": round(nat_gvf, 2), "natural_lines": {"type": "FeatureCollection", "features": [{**f, "id": i} for i, f in enumerate(nat_ll)]},
    }, separators=(",", ":")), encoding="utf8")
    print("\n" + "\n".join(pairs.sentence))
    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()
