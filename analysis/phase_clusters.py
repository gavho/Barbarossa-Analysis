"""Re-cluster division paths separately within each stretch between the AGS phase lines (Frontier box).

The published clusters are fitted to whole paths, as if the advance were one continuous flow. Here every division's path
is cut where it crosses each phase line (a-e), and the pieces in each stretch are clustered on their own, with the same two
methods as the original OP-Barbarossa scripts (github.com/gavho/OP-Barbarossa):
  geometric: symmetric Hausdorff distance between paths -> average-linkage agglomerative clustering
  DV:        k-means on [end x, end y, centroid x, centroid y]   (random_state=42, as the original)
Clusters are then linked stretch to stretch by the divisions they share, which shows groups forming, merging and splitting;
each cluster keeps the id (and map colour) of the previous stretch's cluster it shares most divisions with.

Settings: 4 clusters per stretch, Wehrmacht and SS divisions only, pieces shorter than MIN_PIECE_KM dropped.
Usage: python analysis/phase_clusters.py        (writes analysis/phase_clusters/*)
"""
import json
import math
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from pyproj import Transformer
from scipy.optimize import linear_sum_assignment
from scipy.spatial.distance import directed_hausdorff
from shapely.geometry import LineString, Point, Polygon
from sklearn.cluster import AgglomerativeClustering, KMeans
from sklearn.metrics import adjusted_rand_score, silhouette_score

sys.path.insert(0, str(Path(__file__).parent))
import compare_loa as c  # noqa: E402

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "analysis" / "phase_clusters"
K = 4
NATIONS = {"Wehrmacht", "SS"}
MIN_PIECE_KM = 25  # shorter pieces are mostly the ~17 km position merging, not movement
STEP_KM = 2.0  # pieces are resampled this finely, so centroids and Hausdorff do not depend on vertex spacing
FAR = 3000  # km: phase lines are extended this far north/south, and "east of" polygons this far east
COLORS = ["#ED5151", "#149ECE", "#A7C636", "#9E559C"]


# ---------------------------------------------------------------- phase lines and stretches
PHASE_NO = {l: str(i + 1) for i, l in enumerate("ABCDE")}  # the source layer's line_id a-e; we call them phases 1-5 (Sorin, 11-6)


def phase_lines():
    """Phase lines 1-5 in km, each extended straight north and south so every position is either short of it or past it."""
    gdf = c.gpd.read_file(ROOT / "milestones" / "AGS_Milestones.gdb", layer="AGS_PhaseLines").sort_values("line_id")
    out = {}
    for r in gdf.itertuples():
        line = c.merge_line(c.to_km(r.geometry))
        coords = list(line.coords)
        if coords[0][1] < coords[-1][1]:
            coords = coords[::-1]  # north end first
        (nx, ny), (sx, sy) = coords[0], coords[-1]
        out[PHASE_NO[str(r.line_id).upper()]] = [(nx, ny + FAR), *coords, (sx, sy - FAR)]
    return out


def east_polygon(line):
    """Everything east of an extended north-to-south phase line."""
    (nx, ny), (sx, sy) = line[0], line[-1]
    return Polygon([*line, (sx + FAR, sy), (nx + FAR, ny)])


def stretch_names(letters):
    return [f"Frontier-{letters[0]}"] + [f"{a}-{b}" for a, b in zip(letters, letters[1:])] + [f"Beyond {letters[-1]}"]


def zones(points, polys):
    """For each point, how many phase lines it is past (0 = still short of the first)."""
    return np.array([sum(p.contains(Point(q)) for p in polys) for q in points])


def cut_pieces(points, zone):
    """Split a dated path into one piece per stretch: from where it first entered stretch z to where it first entered z+1.
    Includes the crossing point, so consecutive pieces join. Returns {z: array of points}."""
    out = {}
    for z in range(int(zone.max()) + 1):
        start = np.argmax(zone >= z)
        nxt = np.where(zone >= z + 1)[0]
        end = (nxt[0] + 1) if len(nxt) else len(points)
        if end - start >= 2:
            out[z] = points[start:end]
    return out


def resample(points, step=STEP_KM):
    line = LineString(points)
    n = max(2, int(line.length // step) + 1)
    return np.array([line.interpolate(d).coords[0] for d in np.linspace(0, line.length, n)])


# ---------------------------------------------------------------- the two original clustering methods
def hausdorff_matrix(paths):
    n = len(paths)
    D = np.zeros((n, n))
    for i in range(n):
        for j in range(i + 1, n):
            D[i, j] = D[j, i] = max(directed_hausdorff(paths[i], paths[j])[0], directed_hausdorff(paths[j], paths[i])[0])
    return D


def cluster_geo(paths, k):
    D = hausdorff_matrix(paths)
    labels = AgglomerativeClustering(n_clusters=k, metric="precomputed", linkage="average").fit_predict(D)
    return labels, (silhouette_score(D, labels, metric="precomputed") if 1 < k < len(paths) else None)


def cluster_dv(paths, k):
    X = np.array([[*p[-1], *p.mean(axis=0)] for p in paths])
    labels = KMeans(n_clusters=k, random_state=42, n_init=50).fit_predict(X)
    return labels, (silhouette_score(X, labels) if 1 < k < len(paths) else None)


METHODS = {"DV": cluster_dv, "GEO": cluster_geo}


def north_to_south(labels, paths):
    """Renumber clusters 0..k-1 from north to south (by mean latitude of their members) so ids read the same in every stretch."""
    order = sorted(set(labels), key=lambda l: -np.mean([paths[i][:, 1].mean() for i in np.where(labels == l)[0]]))
    remap = {old: new for new, old in enumerate(order)}
    return np.array([remap[l] for l in labels])


def follow_groups(labels, keys, prev):
    """Renumber so each cluster takes the id of the previous stretch's cluster it shares most divisions with (one-to-one,
    Hungarian assignment). The same id, and so the same colour, then follows one group of divisions across stretches.
    prev: {division key: cluster id in the previous stretch}; empty for the first stretch, which stays north to south.
    The two stretches may have different numbers of clusters. A cluster sharing no division with any earlier one gets an
    id the previous stretch did not use where possible, so a colour never claims a continuity that is not there."""
    if not prev:
        return labels
    n = int(max(labels.max(), max(prev.values()))) + 1
    overlap = np.zeros((n, n))
    for lab, k in zip(labels, keys):
        if k in prev:
            overlap[lab, prev[k]] += 1
    rows, cols = linear_sum_assignment(-overlap)
    remap = {r: c for r, c in zip(rows, cols) if overlap[r, c] > 0}
    used, before = set(remap.values()), set(prev.values())
    free = [i for i in range(n) if i not in used and i not in before] + [i for i in range(n) if i not in used and i in before]
    for lab in sorted(set(labels) - set(remap)):
        remap[lab] = free.pop(0)
    return np.array([remap[l] for l in labels])


# ---------------------------------------------------------------- checks against the published clusters
def validation(flines, f):
    """Re-run the original whole-path clustering (k=5, raw vertices) and compare with the published cluster ids."""
    merc = Transformer.from_crs(c.AEQD, 3857, always_xy=True)
    keys = [k for k in flines]
    rows = []
    for crs, paths in (("equidistant km", [np.array(flines[k].coords) for k in keys]),
                       ("Web Mercator", [np.array([merc.transform(x, y) for x, y in flines[k].coords]) for k in keys])):
        for method, col in (("DV", "DV"), ("GEO", "GEO")):
            labels, _ = METHODS[method](paths, 5) if method == "GEO" else (KMeans(n_clusters=5, random_state=42).fit_predict(
                np.array([[*p[-1], *p.mean(axis=0)] for p in paths])), None)
            published = f.set_index(["Nation", "Branch", "Num_Name"]).loc[keys, col].values
            rows.append({"method": method, "crs": crs, "formations": len(keys), "adjusted_rand_index": round(adjusted_rand_score(published, labels), 2)})
    return pd.DataFrame(rows)


# ---------------------------------------------------------------- main
def unit_names():
    t = pd.read_csv(ROOT / "agol" / "frontier_unit_names.csv")
    col = next(x for x in ("Division Name", "Researched_Name") if x in t)
    t["Number"] = pd.to_numeric(t.Number, errors="coerce")
    return {(row["Nation"], row["Branch"], row["Number"]): row[col] for row in t.to_dict("records")}


def label(key, names):
    n = names.get(key)
    return n if isinstance(n, str) and n != "Not identified" else f"{key[0]} {key[2]} {key[1]}"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    f = c.formations()
    flines = c.formation_lines()
    keep = {k: v for k, v in flines.items() if k[0] in NATIONS}
    names = unit_names()
    print(f"{len(flines)} formation paths, {len(keep)} Wehrmacht/SS kept (nations in paths: {sorted({k[0] for k in flines})})")

    check = validation(keep, f)
    print("\nReproduction of the published whole-path clusters (k=5):\n" + check.to_string(index=False))

    lines = phase_lines()
    letters = list(lines)
    polys = [east_polygon(lines[l]) for l in letters]
    stretches = stretch_names(letters)

    pieces = []  # (key, stretch index, resampled points)
    for key, line in keep.items():
        pts = resample(np.array(line.coords))
        for z, seg in cut_pieces(pts, zones(pts, polys)).items():
            if LineString(seg).length >= MIN_PIECE_KM:
                pieces.append((key, z, seg))
    print(f"\n{len(pieces)} pieces of at least {MIN_PIECE_KM} km")

    inv = Transformer.from_crs(c.AEQD, 4326, always_xy=True)
    to_ll = lambda arr: [[round(v, 5) for v in inv.transform(x, y)] for x, y in arr]
    piece_feats, avg_feats, cluster_rows, assign = [], [], [], {}
    for z, name in enumerate(stretches):
        idx = [i for i, p in enumerate(pieces) if p[1] == z]
        if len(idx) <= K:
            print(f"  {name}: {len(idx)} pieces, too few for {K} clusters; skipped")
            continue
        paths = [pieces[i][2] for i in idx]
        for method, fn in METHODS.items():
            labels, sil = fn(paths, K)
            labels = north_to_south(labels, paths)
            labels = follow_groups(labels, [pieces[i][0] for i in idx],
                                   {k: v for (m, zz, k), v in assign.items() if m == method and zz == z - 1})
            for i, lab in zip(idx, labels):
                assign[(method, z, pieces[i][0])] = int(lab)
            for lab in range(K):
                members = [paths[j] for j in np.where(labels == lab)[0]]
                keys = [pieces[idx[j]][0] for j in np.where(labels == lab)[0]]
                avg = c.average_line([LineString(m) for m in members])
                s, e = np.mean([m[0] for m in members], axis=0), np.mean([m[-1] for m in members], axis=0)
                loo_km = math.dist(s, e)
                mean_len = float(np.mean([LineString(m).length for m in members]))
                row = {"method": method, "stretch": name, "cluster": lab, "divisions": len(members),
                       "silhouette": None if sil is None else round(float(sil), 2), "bearing": round(c.bearing(s, e)),
                       "loo_km": round(loo_km), "directness": round(loo_km / mean_len, 2) if mean_len else None,
                       "members": "; ".join(sorted(label(k, names) for k in keys))}
                cluster_rows.append(row)
                avg_feats.append({"type": "Feature", "properties": {k: v for k, v in row.items() if k != "members"},
                                  "geometry": {"type": "LineString", "coordinates": to_ll(avg.coords)}})
        print(f"  {name}: {len(idx)} pieces clustered")

    for key, z, seg in pieces:
        props = {"division": label(key, names), "nation": key[0], "stretch": stretches[z], "km": round(LineString(seg).length)}
        for m in METHODS:
            props[f"{m}_cluster"] = assign.get((m, z, key))
        piece_feats.append({"type": "Feature", "properties": props, "geometry": {"type": "LineString", "coordinates": to_ll(seg[::3])}})

    # Links between consecutive stretches, and divisions that left the group most of their cluster went on with.
    trans, splits = [], []
    for method in METHODS:
        for z in range(len(stretches) - 1):
            pairs = [(assign[(method, z, k)], assign[(method, z + 1, k)], k) for (m, zz, k) in assign
                     if m == method and zz == z and (method, z + 1, k) in assign]
            if not pairs:
                continue
            df = pd.DataFrame(pairs, columns=["from", "to", "key"])
            for (a, b), g in df.groupby(["from", "to"]):
                trans.append({"method": method, "from_stretch": stretches[z], "from_cluster": a, "to_stretch": stretches[z + 1],
                              "to_cluster": b, "divisions": len(g), "members": "; ".join(sorted(label(k, names) for k in g.key))})
            for a, g in df.groupby("from"):
                main_to = g["to"].mode().iloc[0]
                for r in g[g["to"] != main_to].itertuples():
                    splits.append({"method": method, "from_stretch": stretches[z], "from_cluster": a, "group_went_to": main_to,
                                   "division_went_to": r.to, "division": label(r.key, names), "group_size": len(g)})

    sp = pd.DataFrame(splits)
    if len(sp):
        # A division near a group boundary can flip sides from one stretch to the next by chance; a split that both
        # clustering methods find is the one worth reporting.
        sp["in_both_methods"] = sp.duplicated(["from_stretch", "division"], keep=False)
        both = sp[sp.in_both_methods & (sp.method == "DV")]
        print(f"\nsplits: {sp.groupby('method').size().to_dict()}; found by both methods: {len(both)}")
        for r in both.itertuples():
            print(f"  after {r.from_stretch}: {r.division} left its group (DV cluster {r.from_cluster})")
    pd.DataFrame(cluster_rows).to_csv(OUT / "clusters.csv", index=False)
    pd.DataFrame(trans).to_csv(OUT / "transitions.csv", index=False)
    sp.to_csv(OUT / "splits.csv", index=False)
    check.to_csv(OUT / "validation.csv", index=False)
    for nm, feats in (("pieces", piece_feats), ("average_paths", avg_feats)):
        (OUT / f"{nm}.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")), encoding="utf8")
    # Compact copy for the app's Phases tab: average paths with their members, the pieces, and the corroborated splits.
    app = {"stretches": [s for s in stretches if any(f["properties"]["stretch"] == s for f in avg_feats)],
           "average_paths": {"type": "FeatureCollection", "features": [
               {**f, "id": i, "properties": {**f["properties"], "members": r["members"]}} for i, (f, r) in enumerate(zip(avg_feats, cluster_rows))]},
           "pieces": {"type": "FeatureCollection", "features": [{**f, "id": i} for i, f in enumerate(piece_feats)]},
           "splits": json.loads(sp[sp.in_both_methods].to_json(orient="records")) if len(sp) else []}
    (ROOT / "app" / "src" / "data" / "phase_clusters.json").write_text(json.dumps(app, separators=(",", ":")), encoding="utf8")
    draw(pieces, assign, stretches, lines, avg_feats)
    print(f"\nWrote {OUT}")


def draw(pieces, assign, stretches, lines, avg_feats):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams.update({"font.family": ["Arial", "DejaVu Sans"], "font.size": 7, "pdf.fonttype": 42})
    fwd = Transformer.from_crs(4326, c.AEQD, always_xy=True)
    used = [z for z in range(len(stretches)) if any(k[0] == "DV" and k[1] == z for k in assign)]
    allxy = np.vstack([p[2] for p in pieces])
    x0, x1, y0, y1 = allxy[:, 0].min() - 20, allxy[:, 0].max() + 20, allxy[:, 1].min() - 20, allxy[:, 1].max() + 20
    for method in METHODS:
        cols = 3
        rows = math.ceil(len(used) / cols)
        fig, axes = plt.subplots(rows, cols, figsize=(174 / 25.4, rows * 2.0), squeeze=False)
        for ax in axes.flat[len(used):]:
            ax.axis("off")
        for ax, z in zip(axes.flat, used):
            for l in lines.values():
                arr = np.array(l)
                ax.plot(arr[:, 0], arr[:, 1], color="0.6", lw=0.8, ls=(0, (3, 2)))
            for key, zz, seg in pieces:
                lab = assign.get((method, zz, key))
                if zz == z and lab is not None:
                    ax.plot(seg[:, 0], seg[:, 1], color=COLORS[lab], lw=0.6, alpha=0.45)
            for feat in avg_feats:
                p = feat["properties"]
                if p["method"] == method and p["stretch"] == stretches[z]:
                    xy = np.array([fwd.transform(lo, la) for lo, la in feat["geometry"]["coordinates"]])
                    ax.plot(xy[:, 0], xy[:, 1], color=COLORS[p["cluster"]], lw=2.4, solid_capstyle="round")
                    ax.annotate("", xy=xy[-1], xytext=xy[-4], arrowprops=dict(arrowstyle="-|>", color=COLORS[p["cluster"]], lw=0, mutation_scale=8))
            ax.set_title(stretches[z], fontsize=8, fontweight="bold", loc="left")
            ax.set_xlim(x0, x1)
            ax.set_ylim(y0, y1)
            ax.set_aspect("equal")
            ax.tick_params(labelsize=6)
        fig.suptitle(f"{'Directional-vector' if method == 'DV' else 'Geometric'} clusters per phase stretch (k = {K}); "
                     "thin = division pieces, thick = cluster average path; dashed = phase lines; km from 50N 29E", fontsize=7)
        fig.tight_layout()
        fig.savefig(OUT / f"phase_clusters_{method.lower()}.png", dpi=300)
        fig.savefig(OUT / f"phase_clusters_{method.lower()}.pdf")
        plt.close(fig)


if __name__ == "__main__":
    main()
