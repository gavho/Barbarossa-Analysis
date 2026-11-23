"""Digitize the OKH "Revision of Tasks" 22 III 41 phase lines (AGS DD Planning Map slide) into AGS_Milestones.gdb.

The slide marks each phase line with red symbols (1st star, 2nd diamond, 3rd pentagon, 4th hexagon) over a photo of
a photographed paper map; pixel -> ground is an affine fitted to town dots. Leave-one-out error is ~4.7 km RMS for
affine, 2nd and 3rd order alike: the error is reading the dots off the scan, not paper warp, so higher orders only overfit.
Each line is a centripetal Catmull-Rom curve through its markers, so it bends gently instead of zig-zagging.
Adds layers OKH_PhaseLines and OKH_PhaseMarkers; rerun this after build_milestones.py (which recreates the gdb).

Usage: python build_okh_lines.py path/to/AGS_DD_Planning_Map.pptx
"""
import re
import shutil
import sys
import zipfile

import geopandas as gpd
import numpy as np
import pandas as pd
from pyproj import Transformer
from shapely.geometry import LineString, Point

from build_milestones import GDB, HERE, PHASE_LINES, read_shapes, xfrm

AEQD = "+proj=aeqd +lat_0=50 +lon_0=29 +datum=WGS84 +units=km"  # same as analysis/compare_loa.py
MAX_RESIDUAL_KM = 10  # ~2x the 4.7 km RMS reading error; the slide's symbols are themselves ~10 km across
SAMPLES = 15  # points per span between markers

# Town dot on image1.png (full-resolution pixels), (lat, lon) of the town.
CONTROL = {
    "Lviv": ((2760, 1020), (49.8397, 24.0297)),
    "Brody": ((3155, 864), (50.0814, 25.1512)),
    "Lutsk": ((3222, 482), (50.7472, 25.3254)),
    "Dubno": ((3378, 665), (50.4167, 25.7344)),
    "Rivne": ((3643, 528), (50.6199, 26.2516)),
    "Ostroh": ((3703, 705), (50.3292, 26.5136)),
    "Kremenets": ((3380, 862), (50.1033, 25.7253)),
    "Ternopil": ((3402, 1191), (49.5535, 25.5948)),
    "Starokostiantyniv": ((4029, 1040), (49.7560, 27.2030)),
    "Khmelnytskyi": ((3944, 1240), (49.4229, 26.9871)),
    "Kamianets-Podilskyi": ((3813, 1722), (48.6845, 26.5856)),
    "Khotyn": ((3745, 1832), (48.5070, 26.4900)),
    "Zhytomyr": ((4574, 695), (50.2547, 28.6587)),
    "Radomyshl": ((4794, 565), (50.4969, 29.2325)),
    "Malyn": ((4736, 386), (50.7686, 29.2397)),
    "Berdychiv": ((4570, 923), (49.8993, 28.6023)),
    "Koziatyn": ((4670, 1035), (49.7160, 28.8360)),
    "Skvyra": ((4983, 998), (49.7330, 29.6670)),
    "Kyiv": ((5300, 550), (50.4501, 30.5234)),
    "Vinnytsia": ((4555, 1338), (49.2331, 28.4682)),
    "Zhmerynka": ((4428, 1461), (49.0374, 28.1122)),
    "Haisyn": ((4961, 1581), (48.8125, 29.3897)),
    "Uman": ((5251, 1575), (48.7484, 30.2219)),
    "Holovanivsk": ((5405, 1815), (48.3811, 30.4528)),
    "Novoarkhanhelsk": ((5528, 1623), (48.6645, 30.7999)),
    "Kaniv": ((5706, 933), (49.7500, 31.4667)),
    "Cherkasy": ((5953, 1100), (49.4444, 32.0598)),
    "Smila": ((5896, 1223), (49.2167, 31.8833)),
    "Chyhyryn": ((6186, 1298), (49.0833, 32.6667)),
    "Kropyvnytskyi": ((6096, 1674), (48.5079, 32.2623)),
    "Novoukrainka": ((5801, 1799), (48.3175, 31.5269)),
    "Bobrynets": ((6091, 1952), (48.0578, 32.1586)),
    "Pervomaisk": ((5586, 2008), (48.0441, 30.8507)),
    "Kryve Ozero": ((5381, 2078), (47.9400, 30.3500)),
    "Bratske": ((5876, 2096), (47.8600, 31.5800)),
    "Voznesensk": ((5816, 2318), (47.5670, 31.3330)),
}
LINES = {"star5": ("a", "1st line"), "diamond": ("b", "2nd line"), "pentagon": ("c", "3rd line"), "hexagon": ("d", "4th line")}
MARKER = {"star5": "star", "diamond": "diamond", "pentagon": "pentagon", "hexagon": "hexagon"}
SOURCE = "OKH 'Revision of Tasks' 22 III 41 (T311 R260 #146); AGS DD Planning Map 15 II 41"


def poly(px):
    x, y = np.asarray(px, float).T / 1000
    return np.column_stack([np.ones_like(x), x, y])


def fit():
    """Pixel -> AEQD km by least-squares affine; asserts every town is within MAX_RESIDUAL_KM."""
    to_km = Transformer.from_crs(4326, AEQD, always_xy=True)
    px = [p for p, _ in CONTROL.values()]
    km = np.array([to_km.transform(lon, lat) for _, (lat, lon) in CONTROL.values()])
    coef, *_ = np.linalg.lstsq(poly(px), km, rcond=None)
    resid = np.hypot(*(poly(px) @ coef - km).T)
    for name, r in zip(CONTROL, resid):
        print(f"  {name:20s} residual {r:5.2f} km")
    assert resid.max() < MAX_RESIDUAL_KM, f"control-point residual {resid.max():.1f} km too large"
    return coef


def catmull_rom(p, n=SAMPLES):
    """Centripetal Catmull-Rom through every point of p (no overshoot or loops); 2 points stay a straight segment."""
    if len(p) < 3:
        return p
    p = np.vstack([2 * p[0] - p[1], p, 2 * p[-1] - p[-2]])
    out = [p[1]]
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1:i + 3]
        t0 = 0.0
        t1 = t0 + np.linalg.norm(p1 - p0) ** 0.5
        t2 = t1 + np.linalg.norm(p2 - p1) ** 0.5
        t3 = t2 + np.linalg.norm(p3 - p2) ** 0.5
        for t in np.linspace(t1, t2, n + 1)[1:, None]:
            a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
            a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
            a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
            b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
            b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
            out.append((t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2)
    return np.array(out)


def ordered(km):
    """Markers in order along the line's main axis, north (or west) end first."""
    c = km - km.mean(axis=0)
    axis = np.linalg.svd(c, full_matrices=False)[2][0]
    if axis[1] < 0 or (abs(axis[1]) < 1e-9 and axis[0] > 0):
        axis = -axis  # point north
    return km[np.argsort(-(c @ axis))]


def nearest_town(xy, towns, max_km=15):
    name, d = min(((n, np.hypot(*(xy - t))) for n, t in towns.items()), key=lambda x: x[1])
    return name if d <= max_km else None


def main():
    pptx = sys.argv[1]
    with zipfile.ZipFile(pptx) as z:
        slide = z.read("ppt/slides/slide1.xml").decode("utf8")
        png_header = z.read("ppt/media/image1.png")[:24]
    w, h = int.from_bytes(png_header[16:20], "big"), int.from_bytes(png_header[20:24], "big")
    shapes = read_shapes(slide)
    pic = shapes["Picture 4"]
    px, py, pcx, pcy = xfrm(pic)
    l, t, r, b = (int(re.search(rf'<a:srcRect[^>]*\b{k}="(\d+)"', pic).group(1)) / 1e5 for k in "ltrb")
    legend = xfrm(shapes["Rectangle 104"])

    def to_pixel(ex, ey):  # slide EMU -> full image pixel, through the picture's crop
        return (l + (ex - px) / pcx * (1 - l - r)) * w, (t + (ey - py) / pcy * (1 - t - b)) * h

    print(f"Fitting {len(CONTROL)} control points on {w}x{h} scan:")
    coef = fit()
    to_ll = Transformer.from_crs(AEQD, 4326, always_xy=True)
    to_km = Transformer.from_crs(4326, AEQD, always_xy=True)
    towns = {n: np.array(to_km.transform(lon, lat)) for n, (_, (lat, lon)) in CONTROL.items()}

    marks = {k: [] for k in LINES}
    for name, block in shapes.items():
        prst = re.search(r'prst="(\w+)"', block)
        if not prst or prst.group(1) not in LINES:
            continue
        x, y, cx, cy = xfrm(block)
        if legend[0] <= x <= legend[0] + legend[2] and legend[1] <= y <= legend[1] + legend[3]:
            continue  # the legend's own symbols
        marks[prst.group(1)].append(to_pixel(x + cx / 2, y + cy / 2))

    lines, points = [], []
    for prst, (lid, name) in LINES.items():
        km = ordered(poly(marks[prst]) @ coef)
        curve = catmull_rom(km)
        towns_on = [nearest_town(p, towns) or "{:.2f}N {:.2f}E".format(*to_ll.transform(*p)[::-1]) for p in km]
        src = PHASE_LINES[f"Freeform: Shape {'abcd'.index(lid) + 5}"]  # the historian's line with the same letter
        lines.append(dict(line_id=lid, name=name, towns=" - ".join(towns_on), marker=MARKER[prst],
                          planned_date=src["planned_date"], date_start=src["date_start"], date_end=src["date_end"],
                          source=SOURCE, geometry=LineString([to_ll.transform(*p) for p in curve])))
        points += [dict(line_id=lid, marker=MARKER[prst], order=i + 1, geometry=Point(to_ll.transform(*p))) for i, p in enumerate(km)]
        print(f"  {name}: {len(km)} markers, {LineString(curve).length:.0f} km: {lines[-1]['towns']}")

    phase = gpd.GeoDataFrame(lines, crs=4326)
    for col in ("date_start", "date_end"):
        phase[col] = pd.to_datetime(phase[col])
    markers = gpd.GeoDataFrame(points, crs=4326).astype({"order": "int32"})  # FileGDB has no Int64 before Pro 3.2
    for lyr, gdf in (("OKH_PhaseLines", phase), ("OKH_PhaseMarkers", markers)):
        gdf.to_file(GDB, layer=lyr, driver="OpenFileGDB")  # adds or replaces this layer; the others stay
        print(f"Wrote {lyr}: {len(gdf)} features")
    zip_path = shutil.make_archive(str(GDB), "zip", root_dir=HERE, base_dir=GDB.name)
    print(f"Upload-ready zip: {zip_path}")


if __name__ == "__main__":
    main()
