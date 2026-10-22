"""Export the AGOL snapshot + AGS milestones into compact GeoJSON the app embeds.

Usage: python app/scripts/export_data.py
Reads the newest agol/AGOL_snapshot_*.gdb and milestones/AGS_Milestones.gdb,
writes app/src/data/*.json plus meta.json (snapshot date, counts).
"""
import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import pyogrio

warnings.filterwarnings("ignore", category=RuntimeWarning)

ROOT = Path(__file__).resolve().parents[2]
SNAP = sorted((ROOT / "agol").glob("AGOL_snapshot_*.gdb"))[-1]
MILESTONES = ROOT / "milestones" / "AGS_Milestones.gdb"
OUT = ROOT / "app" / "src" / "data"

# Division paths and division_days use these short names; points use the coded domain.
NATION_SHORT = {1: "Wehrmacht", 2: "SS", 3: "Hungarian", 4: "Slovak", 5: "Finnish", 6: "Italian", 7: "Romanian"}

REGIONS = {
    "frontier": dict(points="Frontier_Points", paths="Frontier_Paths", ellipses="Frontier_Ellipses",
                     dv="DirectionalVector_Cluster_Avg_Paths", geo="Geometric_Cluster_avg_paths",
                     days="frontier_division_days"),
    "leningrad": dict(points="Leningrad_Points", paths="Leningrad_Paths", ellipses="Leningrad_Ellipses",
                      dv="Leningrad_DV_Cluster_Avg_Paths", geo="Leningrad_Geo_Cluster_Avg_Paths",
                      days="leningrad_division_days"),
    "smolensk": dict(points="Smolensk_Points", paths="Smolensk_Paths", ellipses="Smolensk_Ellipses",
                     dv="Smolensk_DV_Cluster_Avg_Paths", geo="Smolensk_Geo_Cluster_Avg_Paths",
                     days="smolensk_division_days"),
    "typhoon": dict(points="Operation_Typhoon_Points", paths="Typhoon_Paths", ellipses="Typhoon_Ellipses",
                    dv="Typhoon_DV_Avg_Cluster_Paths", geo="Typhoon_Geo_Cluster_Avg_Paths",
                    days="typhoon_division_days"),
}


def read(layer, gdb=SNAP, geometry=True):
    return pyogrio.read_dataframe(gdb, layer=layer, read_geometry=geometry)


def domain(name):
    df = read(f"domain_{name}", geometry=False)
    return dict(zip(df.Code, df.Label))


def day(series):
    return series.dt.strftime("%Y-%m-%d").where(series.notna(), None)


def clean(v):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating, float)):
        return round(float(v), 3)
    return v


def rnd(coords):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], 5), round(coords[1], 5)]
    return [rnd(c) for c in coords]


def to_geojson(gdf, props, simplify=None):
    gdf = gdf.to_crs(4326)
    if simplify:
        gdf["geometry"] = gdf.geometry.simplify(simplify, preserve_topology=True)
    feats = []
    for i, (geom, row) in enumerate(zip(gdf.geometry, gdf[props].itertuples(index=False))):
        if geom is None or geom.is_empty:
            continue
        g = geom.__geo_interface__
        # FileGDB promoted single parts to multi; unwrap so MapLibre filters stay simple.
        if g["type"].startswith("Multi") and len(g["coordinates"]) == 1:
            g = {"type": g["type"][5:], "coordinates": g["coordinates"][0]}
        feats.append({"type": "Feature", "id": i,
                      "properties": {k: clean(v) for k, v in zip(props, row)},
                      "geometry": {"type": g["type"], "coordinates": rnd(list(g["coordinates"]))}})
    return {"type": "FeatureCollection", "features": feats}


def points(layer, d, keep=None):
    df = read(layer)
    n = len(df)
    df["Date"] = day(df.Date)
    for f in ("Branch_Type", "Unit_Type", "Posture", "Nation"):
        codes = df[f].dropna().astype(int)
        lookup = NATION_SHORT if f == "Nation" else d[f]
        missing = codes[~codes.isin(list(lookup))]
        if len(missing):
            # Kept visible (not dropped) so data issues show up in the app and get fixed at source.
            print(f"  WARNING {layer}.{f}: {len(missing)} rows with codes outside the domain "
                  f"{sorted(set(missing))} -> 'Code N'")
        df[f] = df[f].map(lambda c: lookup.get(int(c), f"Code {int(c)}") if pd.notna(c) else None)
    for f in ("Geo_ClusterID", "DV_ClusterID"):
        if f not in df:
            df[f] = None
    props = ["Date", "Num_Name", "Branch_Type", "Unit_Type", "Posture", "Frac_Unit", "Nation",
             "Geo_ClusterID", "DV_ClusterID"]
    fc = to_geojson(df, keep or props)
    empty = int((df.geometry.isna() | df.geometry.is_empty).sum())
    if empty:
        print(f"  WARNING {layer}: skipped {empty} rows with no geometry")
    assert len(fc["features"]) == n - empty, f"{layer}: {len(fc['features'])} of {n - empty} features exported"
    return fc


def lines(layer, props, dates):
    df = read(layer)
    for f in dates:
        df[f] = day(df[f])
    for f in set(props) - set(df.columns):
        print(f"  NOTE {layer}: no {f} field")
        df[f] = None
    fc = to_geojson(df, props, simplify=0.0005)
    assert len(fc["features"]) == len(df), layer
    return fc


COUNTRIES_URL = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/"
                 "ne_50m_admin_0_countries.geojson")


def countries():
    """Modern borders clipped to the theatre: drawn under the data so the map still reads offline."""
    import geopandas as gpd
    from shapely.geometry import box
    gdf = gpd.read_file(COUNTRIES_URL)[["NAME", "geometry"]]
    gdf["geometry"] = gdf.geometry.intersection(box(10, 40, 50, 66)).simplify(0.02)
    gdf = gdf[~gdf.geometry.is_empty].rename(columns={"NAME": "name"})
    return to_geojson(gdf.set_crs(4326), ["name"])


def write(name, obj):
    path = OUT / f"{name}.json"
    path.write_text(json.dumps(obj, separators=(",", ":")), encoding="utf8")
    return path.stat().st_size


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    d = {f: domain(f) for f in ("Branch_Type", "Unit_Type", "Posture")}
    sizes, counts = {}, {}

    def put(name, obj):
        sizes[name] = write(name, obj)
        counts[name] = len(obj["features"]) if "features" in obj else len(obj)

    put("overview_points", points("Barbarossa_Points", d, keep=["Date", "Frac_Unit"]))  # heatmap only
    aoi = read("Areas_of_Interest")
    put("areas", to_geojson(aoi, ["Region"], simplify=0.01))

    cluster_props = ["Cluster_ID", "Day_Index", "Date", "Start_Date", "End_Date", "Speed_km_day",
                     "Cumulative_Distance_km", "CID_div_total"]
    path_props = ["Num_Name", "Branch", "Nation", "Start_Date", "End_Date", "Duration_Days", "Distance_KM",
                  "Avg_Speed_KM_Day", "Geo_ClusterID", "DV_ClusterID"]
    for region, L in REGIONS.items():
        put(f"{region}_points", points(L["points"], d))
        put(f"{region}_paths", lines(L["paths"], path_props, ["Start_Date", "End_Date"]))
        put(f"{region}_dv", lines(L["dv"], cluster_props, ["Date", "Start_Date", "End_Date"]))
        put(f"{region}_geo", lines(L["geo"], cluster_props, ["Date", "Start_Date", "End_Date"]))
        ell = read(L["ellipses"])
        ell["Date"] = day(ell.Date)
        put(f"{region}_ellipses", to_geojson(ell, ["Date"], simplify=0.01))
        days = read(L["days"], geometry=False)
        put(f"{region}_days", days.astype(object).map(clean).to_dict("records"))

    ms = {}
    for layer in ("AGS_PhaseLines", "AGS_AdvanceLines", "AGS_SmallPocketCOA"):
        df = read(layer, gdb=MILESTONES)
        for f in ("date_start", "date_end"):
            if f in df:
                df[f] = day(pd.to_datetime(df[f], utc=True))
        props = [c for c in df.columns if c not in ("geometry", "source_shape", "source_note")]
        ms[layer] = to_geojson(df, props)
    put("milestones", ms)
    if not (OUT / "countries.json").exists():  # static reference data; fetched once
        put("countries", countries())
    counts["milestones"] = {k: len(v["features"]) for k, v in ms.items()}

    stamp = SNAP.stem.replace("AGOL_snapshot_", "")
    meta = {"snapshot": f"{stamp[:4]}-{stamp[4:6]}-{stamp[6:]}", "counts": counts}
    write("meta", meta)
    for k in sorted(sizes):
        print(f"  {k:22s} {counts[k]!s:>34s}  {sizes[k] / 1024:8.0f} KB")
    print(f"Total {sum(sizes.values()) / 1024 / 1024:.2f} MB from {SNAP.name}")


if __name__ == "__main__":
    main()
