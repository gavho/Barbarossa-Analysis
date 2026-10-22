"""Digitize the historian's AGS "Milestones" slide into a File Geodatabase.

The slide draws PowerPoint freeforms over a Google Maps screenshot (Web Mercator),
so slide EMU -> image pixel -> EPSG:3857 is affine; we fit it from city control points.

Usage: python build_milestones.py [path/to/slide.pptx]
"""
import re
import shutil
import sys
import zipfile
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from pyproj import Transformer
from shapely.geometry import LineString

HERE = Path(__file__).parent
PPTX = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "Milestones AGS empirical box.pptx"
GDB = HERE / "AGS_Milestones.gdb"

# Control points: (pixel x, pixel y) of the city dot on image1.png, (lat, lon) of the city.
CONTROL = {
    "Lviv": ((22, 277), (49.8397, 24.0297)),
    "Kovel": ((97, 31), (51.2153, 24.7086)),
    "Lutsk": ((168, 114), (50.7472, 25.3254)),
    "Rivne": ((275, 138), (50.6199, 26.2516)),
    "Ternopil": ((199, 327), (49.5535, 25.5948)),
    "Chernivtsi": ((238, 545), (48.2921, 25.9358)),
    "Zhytomyr": ((548, 202), (50.2547, 28.6587)),
    "Vinnytsia": ((527, 383), (49.2331, 28.4682)),
    "Kyiv": ((759, 169), (50.4501, 30.5234)),
    "Uman": ((726, 467), (48.7484, 30.2219)),
    "Pervomaisk": ((801, 588), (48.0441, 30.8507)),
    "Cherkasy": ((935, 348), (49.4444, 32.0598)),
    "Kropyvnytskyi": ((953, 508), (48.5079, 32.2623)),
    "Poltava": ((1218, 321), (49.5883, 34.5514)),
}
MAX_RESIDUAL_KM = 5

# Dates are the historian's estimates; date_start/date_end give a window for the AGOL time slider.
PHASE_LINES = {
    "Freeform: Shape 5": dict(
        line_id="a", name="Frontier break-in",
        towns="Kovel / Kowel - Lutsk / Luck - Brody - Lviv / L'vov / Lemberg",
        planned_date="~30 Jun 1941", date_start="1941-06-22", date_end="1941-06-30",
        units="6A, PzGp1",
        notes="Between 21 June border and Styr River. Around this time Germans became aware of threat "
              "in the marshes (see T-S-F case study) and began redirecting 6A toward ENE."),
    "Freeform: Shape 6": dict(
        line_id="b", name="Stalin Line / 1939 border break-through",
        towns="Novograd-Volynsky / Zviahel - Dubno - Volochisk / Volochysk - Gusyatin / Husiatyn",
        planned_date="~7 Jul 1941 (17A ~15 Jul)", date_start="1941-07-01", date_end="1941-07-15",
        units="6A, PzGp1 (~7 Jul); 17A (~15 Jul)", notes=""),
    "Freeform: Shape 7": dict(
        line_id="c", name="Break-out into Soviet depth",
        towns="Zhitomir / Zhytomyr - Berdichev / Berdychiv - Proskurov / Khmelnytskyi",
        planned_date="mid-Jul 1941", date_start="1941-07-08", date_end="1941-07-15",
        units="AGS", notes="Expected break-out line by mid-July."),
    "Freeform: Shape 8": dict(
        line_id="d", name="Turn SE / small encirclement",
        towns="Kiev / Kyiv - Vinnitsa / Vinnytsia - Uman",
        planned_date="after mid-Jul 1941", date_start="1941-07-16", date_end="1941-07-25",
        units="11A, 17A, PzGp1",
        notes="Best-guess line. 11A & 17A execute small encirclement at Vinnitsa; PzGp1 either helps "
              "with that pocket or goes deep past Uman to Kirovograd-Dnepropetrovsk (either/or orders)."),
    "Freeform: Shape 9": dict(
        line_id="e", name="Large encirclement",
        towns="Kiev / Kyiv - Kirovograd / Kropyvnytskyi - Pervomaisk",
        planned_date="late Jul 1941", date_start="1941-07-26", date_end="1941-07-31",
        units="PzGp1, 17A (6A near Kiev/marshes)",
        notes="Best-guess line. PzGp1 and 17A close jaws SE of Uman near Pervomaisk; 6A increasingly "
              "involved in the marshes and near Kiev."),
}
ADVANCE_LINES = {
    "Freeform: Shape 19": dict(adv_order=1, unit="6A", color="purple",
        notes="Originally to follow/support PzGp1; about 3/4 of the way to Kiev veers N toward the marshes."),
    "Freeform: Shape 20": dict(adv_order=2, unit="III PzKo", color="blue",
        notes="III Panzer Corps of PzGp1 veering toward Kiev."),
    "Freeform: Shape 21": dict(adv_order=3, unit="PzGp1(-)", color="orange",
        notes="Rest of PzGp1 in the great clockwise arc toward Cherkassy-Kremenchug."),
    "Freeform: Shape 22": dict(adv_order=4, unit="17A", color="black", notes=""),
}
SMALL_POCKET = {
    "Freeform: Shape 44": dict(unit="11A", notes="Original small-pocket COA: 11A jaw (from Romania) toward Proskurov/Vinnitsa."),
    "Freeform: Shape 45": dict(unit="17A", notes="Original small-pocket COA: 17A jaw toward Proskurov/Vinnitsa."),
}
COMMON_NOTE = "11A advanced from Romania, off the source map; not digitized."


def bezier(p0, p1, p2, p3, n=20):
    t = np.linspace(0, 1, n + 1)[1:, None]
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3


def read_shapes(slide_xml):
    """Return {shape name: (xfrm block, shape xml)}."""
    return {re.search(r'name="([^"]*)"', b).group(1): b
            for b in re.findall(r"<p:(?:sp|pic)>.*?</p:(?:sp|pic)>", slide_xml, re.S)}


def xfrm(block):
    assert "rot=" not in re.search(r"<a:xfrm[^>]*>", block).group(0), "rotated shapes not supported"
    x, y, cx, cy = map(int, re.search(
        r'<a:off x="(-?\d+)" y="(-?\d+)"/><a:ext cx="(\d+)" cy="(\d+)"', block).groups())
    return x, y, cx, cy


def freeform_emu(block):
    """Sample a custGeom path (moveTo/lnTo/cubicBezTo) into slide EMU coordinates."""
    x, y, cx, cy = xfrm(block)
    path = re.search(r'<a:path w="(\d+)" h="(\d+)">(.*?)</a:path>', block, re.S)
    pw, ph = int(path.group(1)), int(path.group(2))
    pts = []
    for op, body in re.findall(r"<a:(moveTo|lnTo|cubicBezTo)>(.*?)</a:\1>", path.group(3), re.S):
        ctrl = np.array(re.findall(r'<a:pt x="(-?\d+)" y="(-?\d+)"/>', body), float)
        if op == "cubicBezTo":
            pts.extend(bezier(np.array(pts[-1]), *ctrl))
        else:
            pts.extend(ctrl)
    pts = np.array(pts)
    return np.column_stack([x + pts[:, 0] * cx / pw, y + pts[:, 1] * cy / ph])


def fit_pixel_to_mercator():
    to_merc = Transformer.from_crs(4326, 3857, always_xy=True)
    px = np.array([c[0] for c in CONTROL.values()], float)
    merc = np.array([to_merc.transform(lon, lat) for _, (lat, lon) in CONTROL.values()])
    A = np.column_stack([px, np.ones(len(px))])
    coef, *_ = np.linalg.lstsq(A, merc, rcond=None)
    # Mercator metres are stretched by 1/cos(lat); convert residuals to ground km.
    scale = np.cos(np.radians([lat for _, (lat, _) in CONTROL.values()]))
    resid_km = np.hypot(*(A @ coef - merc).T) * scale / 1000
    for name, r in zip(CONTROL, resid_km):
        print(f"  {name:14s} residual {r:5.2f} km")
    assert resid_km.max() < MAX_RESIDUAL_KM, f"control-point residual {resid_km.max():.1f} km too large"
    return coef


def main():
    with zipfile.ZipFile(PPTX) as z:
        slide = z.read("ppt/slides/slide1.xml").decode("utf8")
        png_header = z.read("ppt/media/image1.png")[:24]
    w, h = int.from_bytes(png_header[16:20], "big"), int.from_bytes(png_header[20:24], "big")
    shapes = read_shapes(slide)
    px, py, pcx, pcy = xfrm(shapes["Picture 4"])

    print(f"Fitting {len(CONTROL)} control points on {w}x{h} basemap:")
    coef = fit_pixel_to_mercator()

    def to_line(name):
        emu = freeform_emu(shapes[name])
        pix = np.column_stack([(emu[:, 0] - px) * w / pcx, (emu[:, 1] - py) * h / pcy])
        merc = np.column_stack([pix, np.ones(len(pix))]) @ coef
        return LineString(merc)

    def layer(spec, extra=None):
        rows = [dict(attrs, **(extra or {}), source_shape=name, geometry=to_line(name))
                for name, attrs in spec.items()]
        gdf = gpd.GeoDataFrame(rows, crs=3857).to_crs(4326)
        ints = gdf.select_dtypes("int64").columns
        return gdf.astype({c: "int32" for c in ints})  # FileGDB has no Int64 before Pro 3.2

    phase = layer(PHASE_LINES)
    for col in ("date_start", "date_end"):
        phase[col] = pd.to_datetime(phase[col])
    advance = layer(ADVANCE_LINES, dict(has_arrow=1, source_note=COMMON_NOTE))
    pocket = layer(SMALL_POCKET, dict(has_arrow=1))

    if GDB.exists():
        shutil.rmtree(GDB)
    for lyr, gdf in (("AGS_PhaseLines", phase), ("AGS_AdvanceLines", advance), ("AGS_SmallPocketCOA", pocket)):
        gdf.to_file(GDB, layer=lyr, driver="OpenFileGDB")
        print(f"Wrote {lyr}: {len(gdf)} features")

    zip_path = shutil.make_archive(str(GDB), "zip", root_dir=HERE, base_dir=GDB.name)
    print(f"Upload-ready zip: {zip_path}")


if __name__ == "__main__":
    main()
