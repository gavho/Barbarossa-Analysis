"""Phase lines as checkpoints: who crossed each AGS phase line together, where along it, and when.

Replaces "clusters between the lines" (phase_clusters.py, kept as a method check) with something a reader can follow:
  1. Each Wehrmacht/SS division's daily position = its day's locations (Frontier_Points) averaged, weighted by strength.
  2. Where its track first crosses each phase line (lines extended north and south as in phase_clusters.py) gives a
     crossing point and a crossing day, interpolated between the two daily positions either side of the line.
     A division already past a line on its first recorded day has no crossing for that line.
  3. At each line, crossings are grouped by place along the line and day (both standardized, k-means). The number of
     groups (2-5) is the one with the best silhouette among those with no single-division group.
     A "Start" checkpoint comes first: the divisions on the map on 22 June, at their first position, placed along line A
     (km from its north end) and grouped by that place alone (they share the day). Divisions that first appear later join
     at the first line they cross.
  4. Groups at the first checkpoint are numbered north to south; at each later line a group takes the number of the earlier
     group it shares most divisions with (phase_clusters.follow_groups), so one map colour follows one group.
  5. Flows between consecutive lines (which group's divisions crossed the next line with which group, or did not reach
     it) feed the app's flow chart. A flow that takes a large share of a group means the group divided; a small one
     (at most BREAKAWAY_MAX divisions and under a quarter of the group) is listed by name as a breakaway.

Usage: python analysis/phase_checkpoints.py   (writes analysis/phase_checkpoints/* and app/src/data/phase_checkpoints.json)
"""
import json
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from pyproj import Transformer
from shapely.geometry import LineString, Point
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

sys.path.insert(0, str(Path(__file__).parent))
import compare_loa as c  # noqa: E402
import phase_clusters as pc  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "analysis" / "phase_checkpoints"
NATION_CODES = {1: "Wehrmacht", 2: "SS"}  # domain_Nation: 1 DE (Wehrmacht), 2 SS
K_RANGE = range(2, 6)  # the app has five group colours
DAY0 = pd.Timestamp("1941-06-22", tz="UTC")
START = "Start"  # the checkpoint before line A: the 22 June line-up
BREAKAWAY_MAX = 2  # at most this many divisions (and under a quarter of the group) leaving together is a breakaway


def daily_tracks():
    """{division key (Nation, Branch, Number): DataFrame of day, x, y} from strength-weighted daily mean locations."""
    p = gpd.read_file(c.DATA / "Frontier_Points.geojson")
    p = p[p.Nation.isin(NATION_CODES)].copy()
    branch = pd.read_csv(c.DATA / "domain_Branch_Type.csv").set_index("Code").Label.to_dict()
    km = [c.to_km(g) for g in p.geometry]
    p["x"], p["y"], p["w"] = [q.x for q in km], [q.y for q in km], p.Frac_Unit.fillna(1.0)
    p["day"] = (p.Date - DAY0).dt.days
    p["key"] = list(zip(p.Nation.map(NATION_CODES), p.Branch_Type.map(branch), p.Num_Name))
    out = {}
    for key, g in p.groupby("key"):
        d = g.groupby("day").apply(lambda h: pd.Series({"x": np.average(h.x, weights=h.w), "y": np.average(h.y, weights=h.w)}))
        if len(d) >= 2:
            out[key] = d.reset_index()
    return out


def crossing(track, line, poly):
    """First crossing of one extended phase line: (point, day, km along the line from its north end), or None when the
    track never gets past it or starts past it."""
    past = np.array([poly.contains(Point(x, y)) for x, y in zip(track.x, track.y)])
    i = int(np.argmax(past))
    if not past.any() or i == 0:
        return None
    a, b = (track.x[i - 1], track.y[i - 1]), (track.x[i], track.y[i])
    hit = LineString([a, b]).intersection(LineString(line))
    pt = hit.geoms[0] if hasattr(hit, "geoms") else hit
    if pt.is_empty:  # the step only clipped the polygon's far edge; take the first position past the line
        pt = Point(b)
    t = Point(a).distance(pt) / max(Point(a).distance(Point(b)), 1e-9)
    day = track.day[i - 1] + t * (track.day[i] - track.day[i - 1])
    return pt, float(day), LineString(line).project(pt) - pc.FAR


def start_point(track, first_line):
    """Position on 22 June for the Start checkpoint: (point, day 0, km along the first phase line from its north end), or
    None for a division first recorded later."""
    if track.day[0] != 0:
        return None
    pt = Point(track.x[0], track.y[0])
    return pt, 0.0, LineString(first_line).project(pt) - pc.FAR


def group_line(df):
    """Labels for one line's crossings (columns along, day): best-silhouette k with no single-division group.
    A column with no spread (the Start checkpoint's shared day) is left out."""
    X = df[["along", "day"]].values
    X = X[:, X.std(axis=0) > 0]
    X = (X - X.mean(axis=0)) / X.std(axis=0)
    best = None
    for k in K_RANGE:
        if k >= len(df):
            break
        labels = KMeans(n_clusters=k, random_state=42, n_init=50).fit_predict(X)
        if np.bincount(labels).min() < 2:
            continue
        sil = silhouette_score(X, labels)
        if best is None or sil > best[1]:
            best = (labels, sil)
    return best


SECTORS = {1: ["whole line"], 2: ["northern", "southern"], 3: ["northern", "central", "southern"],
           4: ["northern", "north-central", "south-central", "southern"],
           5: ["northern", "north-central", "central", "south-central", "southern"]}


def date(day):
    d = DAY0 + pd.Timedelta(days=round(day))
    return f"{d.day} {d:%b}"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    tracks = daily_tracks()
    names = pc.unit_names()
    lines = pc.phase_lines()
    letters = list(lines)
    inv = Transformer.from_crs(c.AEQD, 4326, always_xy=True)
    ll = lambda x, y: [round(v, 5) for v in inv.transform(x, y)]

    rows = []
    for key, tr in tracks.items():
        hit = start_point(tr, lines[letters[0]])
        if hit:
            pt, day, along = hit
            rows.append({"key": key, "division": pc.label(key, names), "line": START, "x": pt.x, "y": pt.y, "day": day, "along": along})
        for L in letters:
            hit = crossing(tr, lines[L], pc.east_polygon(lines[L]))
            if hit:
                pt, day, along = hit
                rows.append({"key": key, "division": pc.label(key, names), "line": L, "x": pt.x, "y": pt.y, "day": day, "along": along})
    cr = pd.DataFrame(rows)
    print(f"{len(tracks)} Wehrmacht/SS divisions; crossings per line: {cr.groupby('line').size().to_dict()}")

    letters = [START] + letters  # checkpoints in order
    group, info, groups = {}, {}, []
    for j, L in enumerate(letters):
        df = cr[cr.line == L].reset_index(drop=True)
        best = group_line(df) if len(df) >= 4 else None
        if best is None:
            print(f"  line {L}: {len(df)} crossings, too few to group")
            continue
        labels, sil = best
        if j == 0 or not any(g for (l, _), g in group.items() if l == letters[j - 1]):
            order = sorted(set(labels), key=lambda l: df.along[labels == l].mean())  # north end of the line first
            labels = np.array([order.index(l) for l in labels])
        else:
            prev = {k: g for (l, k), g in group.items() if l == letters[j - 1]}
            labels = pc.follow_groups(labels, list(df.key), prev)
        cr.loc[cr.line == L, "group"] = labels
        for k, g in zip(df.key, labels):
            group[(L, k)] = int(g)
        info[L] = {"k": len(set(labels)), "silhouette": round(float(sil), 2)}
        order = sorted(set(labels), key=lambda l: df.along[labels == l].mean())
        for g in sorted(set(labels)):
            m = df[labels == g]
            groups.append({"line": L, "group": int(g), "divisions": len(m), "sector": SECTORS[len(order)][order.index(g)],
                           "first": date(m.day.min()), "median": date(m.day.median()), "last": date(m.day.max()),
                           "lonlat": ll(m.x.mean(), m.y.mean()), "members": "; ".join(sorted(m.division))})
        print(f"  line {L}: {len(df)} crossings in {info[L]['k']} groups (silhouette {info[L]['silhouette']})")

    flows, splits, ribbons = [], [], []
    done = [L for L in letters if L in info]
    for a, b in zip(done, done[1:]):
        here = {k: g for (l, k), g in group.items() if l == a}
        nxt = {k: g for (l, k), g in group.items() if l == b}
        df = pd.DataFrame([{"key": k, "from": g, "to": nxt.get(k)} for k, g in here.items()])
        for (f, t), g in df.groupby(["from", df["to"].fillna(-1)]):
            on = df[(df["from"] == f) & df["to"].notna()]
            largest = on["to"].value_counts().max() if len(on) else 0
            # A big share going elsewhere means the group divided; only a small share is a breakaway worth naming.
            major = t in (-1, f) or len(g) == largest or len(g) >= max(BREAKAWAY_MAX + 1, 0.25 * len(on))
            members = sorted(pc.label(k, names) for k in g.key)
            flows.append({"from_line": a, "from_group": int(f), "to_line": b, "to_group": None if t == -1 else int(t),
                          "divisions": len(g), "major": bool(major), "members": "; ".join(members)})
            if not major:
                splits += [{"from_line": a, "to_line": b, "division": m, "from_group": int(f), "division_went_to": int(t)} for m in members]
        ga = {x["group"]: x for x in groups if x["line"] == a}
        gb = {x["group"]: x for x in groups if x["line"] == b}
        for g in sorted(set(ga) & set(gb)):  # a group that carries on: join its mean crossing points
            n = int(((df["from"] == g) & (df["to"] == g)).sum())
            if n:
                ribbons.append({"type": "Feature", "properties": {"group": g, "from_line": a, "to_line": b, "divisions": n},
                                "geometry": {"type": "LineString", "coordinates": [ga[g]["lonlat"], gb[g]["lonlat"]]}})

    cr["date"] = [date(d) for d in cr.day]
    cr.drop(columns=["key"]).to_csv(OUT / "crossings.csv", index=False)
    pd.DataFrame(groups).to_csv(OUT / "groups.csv", index=False)
    pd.DataFrame(flows).to_csv(OUT / "flows.csv", index=False)
    pd.DataFrame(splits).to_csv(OUT / "breakaways.csv", index=False)

    app = {"lines": done, "info": info, "groups": groups, "flows": flows, "splits": splits,
           "ribbons": {"type": "FeatureCollection", "features": [{**f, "id": i} for i, f in enumerate(ribbons)]},
           "crossings": {"type": "FeatureCollection", "features": [
               {"type": "Feature", "id": i, "properties": {"division": r.division, "line": r.line, "date": r.date, "group": int(r.group)},
                "geometry": {"type": "Point", "coordinates": ll(r.x, r.y)}}
               for i, r in enumerate(cr.dropna(subset=["group"]).itertuples())]}}
    (ROOT / "app" / "src" / "data" / "phase_checkpoints.json").write_text(json.dumps(app, separators=(",", ":")), encoding="utf8")
    draw_maps(cr.dropna(subset=["group"]), lines, done)
    print(f"\n{len(splits)} breakaways; wrote {OUT}")


GROUP_NAMES = ["red", "blue", "green", "purple", "orange"]  # the app's colour for each group number


def draw_maps(cr, lines, done):
    """Paper figure, black and white: one map per phase line with its crossings (marker shape = group) and the natural
    natural-break bands of the stretches either side, grey by share of division-days (from phase_distributions.py)."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.lines import Line2D
    from matplotlib.patches import Patch

    zones = json.loads((ROOT / "analysis" / "phase_distributions" / "natural_zones.geojson").read_text(encoding="utf8"))["features"]
    grey = lambda share: str(round(0.93 - (min(max(share, 20), 50) - 20) / 30 * 0.4, 2))  # 20% light .. 50% dark
    marks = "os^Dv"
    (xlo, xhi), (ylo, yhi) = (cr.x.min() - 80, cr.x.max() + 80), (cr.y.min() - 60, cr.y.max() + 60)
    fig, axes = plt.subplots(3, 2, figsize=(10, 12.6), sharex=True, sharey=True)
    for ax in axes.flat[len(done):]:
        ax.axis("off")
    for ax, L in zip(axes.flat, done):
        for f in zones:
            if (L if L != START else "Frontier") in f["properties"]["stretch"].split("-"):
                ax.fill(*zip(*f["geometry"]["coordinates"][0]), color=grey(f["properties"]["share"]), ec="0.55", lw=0.3)
        for M, ln in lines.items():
            ax.plot(*zip(*ln), color="black" if M == L else "0.55", lw=2 if M == L else 0.7, ls="-" if M == L else "--")
            top = LineString(ln).intersection(LineString([(xlo, yhi - 25), (xhi, yhi - 25)]))
            if not top.is_empty:
                pt = top.geoms[0] if hasattr(top, "geoms") else top
                ax.text(pt.x + 6, pt.y, M, fontsize=9 if M == L else 7, weight="bold" if M == L else "normal")
        m = cr[cr.line == L]
        for g, h in m.groupby("group"):
            ax.scatter(h.x, h.y, marker=marks[int(g)], s=24, facecolor="white", edgecolor="black", lw=0.8, zorder=3)
        for n, (lat, lon) in c.CITIES.items():
            q = c.to_km(Point(lon, lat))
            ax.plot(q.x, q.y, "k.", ms=3)
            ax.annotate(n, (q.x, q.y), xytext=(3, 3), textcoords="offset points", fontsize=7, style="italic")
        ax.set_title(f"Start · {len(m)} divisions on 22 Jun" if L == START else
                     f"Line {L} · {len(m)} divisions crossed, {date(m.day.min())} – {date(m.day.max())}", fontsize=9)
        ax.set(xlim=(xlo, xhi), ylim=(ylo, yhi), xticks=[], yticks=[], aspect="equal")
    used = sorted(int(g) for g in cr.group.unique())
    handles = [Line2D([], [], marker=marks[g], ls="", mfc="white", mec="black", label=f"Group {GROUP_NAMES[g]}") for g in used]
    handles += [Patch(color=grey(20), label="few division-days"), Patch(color=grey(50), label="many division-days")]
    fig.legend(handles=handles, loc="lower center", ncol=len(handles), fontsize=8, frameon=False)
    fig.suptitle("Phase lines as checkpoints: the 22 June line-up, where divisions crossed each line, and where they bunched", fontsize=10)
    fig.subplots_adjust(left=0.02, right=0.98, top=0.94, bottom=0.05, hspace=0.12, wspace=0.03)  # equal-aspect panels defeat tight_layout
    for ext in ("png", "pdf"):
        fig.savefig(OUT / f"phase_maps.{ext}", dpi=200)
    plt.close(fig)


if __name__ == "__main__":
    main()
