"""Snapshot public ArcGIS Online layers into a dated File Geodatabase.

Usage: python download_agol.py <url> [<url> ...]
  <url> can be an AGOL group page (...group.html?id=<id>), an item page (...item.html?id=<id>),
  a web map viewer link (...?webmap=<id>), or a FeatureServer / FeatureServer/<n> REST URL.
"""
import datetime
import json
import re
import shutil
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd
import pyogrio

PORTAL = "https://www.arcgis.com/sharing/rest"
GDB = Path(__file__).parent / f"AGOL_snapshot_{datetime.date.today():%Y%m%d}.gdb"


def get_json(url, **params):
    params["f"] = "json"
    with urllib.request.urlopen(f"{url}?{urllib.parse.urlencode(params)}", timeout=60) as r:
        data = json.load(r)
    if "error" in data:
        raise RuntimeError(f"{url}: {data['error']}")
    return data


def service_layers(service_url, title=None):
    """Expand a FeatureServer (or one of its layers) into (title, layer_url) pairs.

    A single-layer service takes `title` (the AGOL item title) when given; layer names are often generic.
    """
    service_url = service_url.rstrip("/")
    if re.search(r"/\d+$", service_url):
        return [(title or get_json(service_url)["name"], service_url)]
    info = get_json(service_url)
    layers = info.get("layers", []) + info.get("tables", [])
    if title and len(layers) == 1:
        return [(title, f"{service_url}/{layers[0]['id']}")]
    return [(f"{title}_{l['name']}" if title else l["name"], f"{service_url}/{l['id']}") for l in layers]


def read_layer(layer_url):
    """Read every feature, paging by resultOffset (GDAL's ESRIJSON driver does not page reliably)."""
    info = get_json(layer_url)
    page_size = info.get("maxRecordCount") or 1000
    pages, offset = [], 0
    while True:
        params = urllib.parse.urlencode(dict(where="1=1", outFields="*", returnGeometry="true", outSR=4326,
                                             orderByFields=info.get("objectIdField", "OBJECTID"), resultOffset=offset,
                                             resultRecordCount=page_size, f="json"))
        page = pyogrio.read_dataframe(f"{layer_url}/query?{params}", driver="ESRIJSON")
        pages.append(page)
        if len(page) < page_size:
            break
        offset += page_size
    return pd.concat(pages, ignore_index=True)


def webmap_layers(layers):
    for l in layers:
        if l.get("layerType") == "GroupLayer":
            yield from webmap_layers(l.get("layers", []))
        elif "FeatureServer" in l.get("url", ""):
            yield from ((l.get("title") or t, u) for t, u in service_layers(l["url"]))
        else:
            print(f"  skipping non-feature layer: {l.get('title')} ({l.get('layerType')})")


def resolve(url):
    if "FeatureServer" in url:
        return service_layers(url.split("?")[0])
    item_id = re.search(r"(?:id|webmap)=([0-9a-f]{32})", url) or re.search(r"\b([0-9a-f]{32})\b", url)
    if not item_id:
        raise ValueError(f"no item id in {url}")
    if "group.html" in url:
        # The group itself may be private; search still returns its publicly shared items.
        found = get_json(f"{PORTAL}/search", q=f"group:{item_id.group(1)}", num=100)["results"]
        services = [i for i in found if i["type"] == "Feature Service"]
        print(f"Group: {len(found)} public items, {len(services)} feature services "
              f"(skipping {len(found) - len(services)} maps/CSVs/apps that reuse them)")
        return [l for i in sorted(services, key=lambda i: i["title"]) for l in service_layers(i["url"], i["title"])]
    item = get_json(f"{PORTAL}/content/items/{item_id.group(1)}")
    print(f"Item: {item['title']} ({item['type']})")
    if item["type"] == "Web Map":
        data = get_json(f"{PORTAL}/content/items/{item['id']}/data")
        return list(webmap_layers(data.get("operationalLayers", []) + data.get("tables", [])))
    if item["type"] == "Feature Service":
        return service_layers(item["url"])
    raise ValueError(f"unsupported item type {item['type']}")


def gdb_name(title, used):
    name = re.sub(r"\W+", "_", title).strip("_")[:60] or "layer"
    name = "L_" + name if name[0].isdigit() else name
    base, i = name, 2
    while name.lower() in used:
        name, i = f"{base}_{i}", i + 1
    used.add(name.lower())
    return name


def main(urls):
    layers = list(dict.fromkeys(l for u in urls for l in resolve(u)))  # dedupe, keep order
    if GDB.exists():
        shutil.rmtree(GDB)
    used, mismatches = set(), []
    for title, layer_url in layers:
        expected = get_json(f"{layer_url}/query", where="1=1", returnCountOnly="true")["count"]
        gdf = read_layer(layer_url)
        name = gdb_name(title, used)
        # Default (pre-Pro 3.2) GDB format so any Pro version opens it; it has no Int64 field type.
        for col in gdf.select_dtypes("int64").columns:
            fits = gdf[col].abs().max() < 2**31 if len(gdf) else True
            gdf[col] = gdf[col].astype("int32" if fits else "float64")
        pyogrio.write_dataframe(gdf, GDB, layer=name, driver="OpenFileGDB", promote_to_multi=True)
        flag = "" if len(gdf) == expected else "  <-- COUNT MISMATCH"
        print(f"  {name}: {len(gdf)}/{expected} features{flag}")
        if flag:
            mismatches.append(name)
    print(f"Wrote {len(layers)} layers to {GDB}")
    if mismatches:
        sys.exit(f"Incomplete download for: {', '.join(mismatches)}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
