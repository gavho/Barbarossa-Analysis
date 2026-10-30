"""Vectorized cluster lines (<= 3 straight vectors per cluster average path) for the app, all regions, DV and GEO.

For each cluster average path: fit the vectors in a region-centred equidistant projection (same dynamic program as
compare_loa.py), then measure every vector on the ellipsoid (geodesic azimuth and length), so bearings and distances are
not distorted by Web Mercator (which stretches lengths ~1.6x at 50N and ~2x at 59N).
Also per cluster: the paper's line of operations (mean member start -> mean member end), its directness, a stability flag
(do the bearings survive a 40 or 80 km minimum vector length?), and for the Frontier the comparison with the planned line
from analysis/loa_frontier/pairs.csv (run analysis/compare_loa.py first).

Usage: python analysis/export_vectors.py     (writes app/src/data/<region>_vectors.json)
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from pyproj import Geod, Transformer

sys.path.insert(0, str(Path(__file__).parent))
import compare_loa as c  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "app" / "src" / "data"
GEOD = Geod(ellps="WGS84")
REGIONS = {
    "frontier": ("DirectionalVector_Cluster_Avg_Paths", "Geometric_Cluster_avg_paths", "Frontier_Paths"),
    "leningrad": ("Leningrad_DV_Cluster_Avg_Paths", "Leningrad_Geo_Cluster_Avg_Paths", "Leningrad_Paths"),
    "smolensk": ("Smolensk_DV_Cluster_Avg_Paths", "Smolensk_Geo_Cluster_Avg_Paths", "Smolensk_Paths"),
    "typhoon": ("Typhoon_DV_Avg_Cluster_Paths", "Typhoon_Geo_Cluster_Avg_Paths", "Typhoon_Paths"),
}
STABLE_DEG = c.NOISE_BEARING_DEG


def vector_stats(lonlat):
    """Geodesic azimuth (deg from true north) and length (km) of each vector, and the turn at each inner vertex
    (+ = clockwise/right), measured between the arrival heading and the next departure heading."""
    az, km, turns, arrive = [], [], [], None
    for (lo1, la1), (lo2, la2) in zip(lonlat, lonlat[1:]):
        a12, a21, d = GEOD.inv(lo1, la1, lo2, la2)
        if arrive is not None:
            turns.append(c.wrap(a12 - arrive))
        az.append(a12 % 360)
        km.append(d / 1000)
        arrive = (a21 + 180) % 360
    return az, km, turns


FIT_TOL_KM = 10  # half the 20 km mapping-error band: a vector set fitting closer than this is good enough


def try_fit(line, k, min_km):
    try:
        V, rms = c.fit_segments(line, k, min_km)
    except ValueError:
        return None
    return (V, rms) if math.isfinite(rms) else None  # inf = no way to place k vectors that long on this path


def fit(line, min_km=c.MIN_SEG_KM):
    """Fewest vectors (1..K) whose RMS distance to the path is within FIT_TOL_KM; otherwise the best-fitting feasible k.
    Paths shorter than min_km get a single start-to-end vector."""
    if line.length < min_km:
        return c.fit_segments(line, 1, 0)
    best = None
    for k in range(1, c.K + 1):
        r = try_fit(line, k, min_km)
        if r is None:
            break
        best = r
        if r[1] <= FIT_TOL_KM:
            break
    return best or c.fit_segments(line, 1, 0)


def geodesic_length(line_km, tr):
    lon, lat = tr.transform(*line_km.xy, direction="INVERSE")
    return GEOD.line_length(lon, lat) / 1000


def plan_rows():
    path = ROOT / "analysis" / "loa_frontier" / "pairs.csv"
    if not path.exists():
        sys.exit("Run python analysis/compare_loa.py first (it writes analysis/loa_frontier/pairs.csv).")
    p = pd.read_csv(path)
    return {(r.clustering, int(r.cluster)): r for r in p[p.clustering.isin(["DV", "GEO"])].itertuples()}


def region_vectors(region, layers, plans):
    dv_name, geo_name, paths_name = layers
    # Equidistant projection centred on the region keeps the fit's distances honest wherever the region is.
    raw = c.gpd.read_file(c.DATA / f"{dv_name}.geojson")
    x0, y0, x1, y1 = raw.total_bounds
    tr = Transformer.from_crs(4326, f"+proj=aeqd +lat_0={(y0 + y1) / 2:.3f} +lon_0={(x0 + x1) / 2:.3f} +datum=WGS84 +units=km", always_xy=True)
    flines = c.formation_lines(paths_name, tr)
    paths = c.gpd.read_file(c.DATA / f"{paths_name}.geojson")
    members = paths.groupby(["Nation", "Branch", "Num_Name"]).agg(DV=("DV_ClusterID", "first"), GEO=("Geo_ClusterID", "first"))
    out = {}
    for clustering, name in (("DV", dv_name), ("GEO", geo_name)):
        feats = []
        for cid, line in sorted(c.cluster_lines(name, tr).items()):
            V, rms = fit(line)
            lonlat = [tuple(tr.transform(x, y, direction="INVERSE")) for x, y in V]
            az, km, turns = vector_stats(lonlat)
            # Stability: with the same number of vectors, does every bearing stay within STABLE_DEG when the minimum
            # vector length is 40 or 80 km instead of 60? None when neither alternative can be fitted (or k = 1).
            checks = []
            for alt in c.SENSITIVITY_MIN_SEG:
                r = try_fit(line, len(az), alt) if alt != c.MIN_SEG_KM and len(az) > 1 else None
                if r:
                    az2, _, _ = vector_stats([tuple(tr.transform(x, y, direction="INVERSE")) for x, y in r[0]])
                    checks.append(all(abs(c.wrap(a - b)) <= STABLE_DEG for a, b in zip(az, az2)))
            stable = all(checks) if checks else None
            mem = [flines[k] for k in members.index[members[clustering] == cid] if k in flines]
            props = {"Clustering": clustering, "Cluster_ID": int(cid), "Vectors": len(az), "Members": len(mem),
                     "Path_km": round(geodesic_length(line, tr)), "Fit_RMS_km": round(rms, 1), "Stable": stable}
            for i, (a, d) in enumerate(zip(az, km), 1):
                props[f"V{i}_Bearing"], props[f"V{i}_km"] = round(a), round(d)
            for i, t in enumerate(turns, 1):
                props[f"Turn{i}"] = round(t)
            if mem:  # the paper's line of operations: mean member start -> mean member end
                s = np.mean([m.coords[0] for m in mem], axis=0)
                e = np.mean([m.coords[-1] for m in mem], axis=0)
                (slo, sla), (elo, ela) = tr.transform(*s, direction="INVERSE"), tr.transform(*e, direction="INVERSE")
                a12, _, d = GEOD.inv(slo, sla, elo, ela)
                mean_len = float(np.mean([geodesic_length(m, tr) for m in mem]))
                props.update({"LOO_Bearing": round(a12 % 360), "LOO_km": round(d / 1000),
                              "Mean_Member_km": round(mean_len), "Directness": round(d / 1000 / mean_len, 2) if mean_len else None})
            plan = plans.get((clustering, int(cid))) if region == "frontier" else None
            if plan is not None:
                props.update({"Plan_Line": plan.planned, "Plan_Frechet_km": int(plan.frechet_km),
                              "Plan_Offset_km": float(plan.mean_signed_offset_km), "Plan_AbsOffset_km": float(plan.mean_abs_offset_km),
                              "Plan_Within50_pct": int(plan.realized_within_50km_pct), "Plan_Beyond_Noise_pct": int(plan.share_beyond_noise_pct),
                              "Plan_Membership_Agrees": bool(plan.membership_agrees)})
            feats.append({"type": "Feature", "id": len(feats), "properties": props,
                          "geometry": {"type": "LineString", "coordinates": [[round(x, 5), round(y, 5)] for x, y in lonlat]}})
        out[clustering.lower()] = {"type": "FeatureCollection", "features": feats}
    return out


def main():
    plans = plan_rows()
    for region, layers in REGIONS.items():
        data = region_vectors(region, layers, plans)
        (OUT / f"{region}_vectors.json").write_text(json.dumps(data, separators=(",", ":")), encoding="utf8")
        for k, fc in data.items():
            for f in fc["features"]:
                p = f["properties"]
                vec = " > ".join(f"{p[f'V{i}_Bearing']}°/{p[f'V{i}_km']}km" for i in range(1, p["Vectors"] + 1))
                print(f"{region:9s} {k.upper():3s} c{p['Cluster_ID']} n={p['Members']:2d} {vec:40s} rms {p['Fit_RMS_km']:4.1f} "
                      f"stable {p['Stable']!s:5s} LOO {p.get('LOO_Bearing')}°/{p.get('LOO_km')}km directness {p.get('Directness')}"
                      + (f" | vs {p['Plan_Line']}: frechet {p['Plan_Frechet_km']}" if "Plan_Line" in p else ""))


if __name__ == "__main__":
    main()
