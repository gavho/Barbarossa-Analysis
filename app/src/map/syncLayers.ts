import type { GeoJSONSource, LayerSpecification, Map as MLMap } from "maplibre-gl";
import { COUNTRIES, MILESTONES, type FC } from "@/data";
import { HEAT_RAMP, layersFor, type LayerDef, type LayerId, type LayerStyle } from "@/config/presets";
import { styleOf, type State } from "@/state/store";
import { BASEMAPS, FONT } from "./basemaps";
import { colorExpr, layerFilter, sizeExpr } from "./expressions";

/** Source data for each app layer on the current page. */
export function sourceData(s: State, id: LayerId): FC | null {
  if (id === "plan_phase") return MILESTONES.AGS_PhaseLines;
  if (id === "plan_advance") return MILESTONES.AGS_AdvanceLines;
  if (id === "plan_pocket") return MILESTONES.AGS_SmallPocketCOA;
  if (s.page === "home") return id === "areas" ? s.data.areas : id === "heat" ? s.data.overview : null;
  const r = s.data.regions[s.page];
  return id === "heat" ? r.points : (r[id as "points" | "paths" | "dv" | "geo" | "ellipses"] ?? null);
}

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const vis = (on: boolean) => (on ? "visible" : "none") as "visible" | "none";
const SELECTED = ["boolean", ["feature-state", "selected"], false];

function specs(def: LayerDef, st: LayerStyle, s: State, src: string): LayerSpecification[] {
  const filter = layerFilter(def.time, def.cluster, s.mode, s.date, s.filters, def.id === "points");
  const base = { id: def.id, source: src, ...(filter ? { filter } : {}) };
  const layout = { visibility: vis(st.visible) };
  const widthScale = s.theme === "period" ? 1.25 : 1; // grease-pencil look
  const out: LayerSpecification[] = [];
  switch (def.kind) {
    case "circle":
      out.push({ ...base, type: "circle", layout, paint: {
        "circle-color": colorExpr(st) as never,
        "circle-radius": sizeExpr(st, "circle") as never,
        "circle-opacity": st.opacity,
        "circle-stroke-color": ["case", SELECTED, cssVar("--primary"), st.outline ?? "#000"] as never,
        "circle-stroke-width": ["case", SELECTED, 2.5, 0.6] as never,
        "circle-stroke-opacity": st.opacity,
      } });
      break;
    case "line":
      out.push({ ...base, type: "line", layout: { ...layout, "line-cap": "round", "line-join": "round" }, paint: {
        "line-color": colorExpr(st) as never,
        "line-width": ["*", ["case", SELECTED, 2, 1], sizeExpr(st, "line"), widthScale] as never,
        "line-opacity": st.opacity,
        ...(st.dash ? { "line-dasharray": [3, 2] } : {}),
      } });
      break;
    case "fill":
      out.push({ ...base, type: "fill", layout, paint: { "fill-color": colorExpr(st) as never, "fill-opacity": st.opacity } });
      out.push({ ...base, id: `${def.id}-outline`, type: "line", layout, paint: { "line-color": st.outline ?? st.color, "line-width": 1 } });
      break;
    case "heatmap":
      out.push({ ...base, type: "heatmap", layout, paint: {
        "heatmap-weight": ["to-number", ["coalesce", ["get", "Frac_Unit"], 0.5]],
        "heatmap-radius": st.heatRadius ?? 30,
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 8, 1.6],
        "heatmap-opacity": st.opacity,
        "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], ...HEAT_STOPS] as never,
      } });
      break;
  }
  const label = labelText(def.id);
  if (label && st.labels !== false && (st.labels || def.id === "areas")) {
    out.push({ ...base, id: `${def.id}-labels`, type: "symbol",
      layout: { ...layout, "symbol-placement": "line", "text-field": label as never, "text-font": FONT, "text-size": 11, "text-letter-spacing": 0.05 },
      paint: { "text-color": cssVar("--foreground"), "text-halo-color": cssVar("--background"), "text-halo-width": 1.5 } });
  }
  return out;
}

const HEAT_STOPS = HEAT_RAMP.flat();

function labelText(id: LayerId): unknown {
  if (id === "dv" || id === "geo") return ["case", ["==", ["%", ["to-number", ["get", "Day_Index"], 0], 7], 1], ["slice", ["to-string", ["get", "Date"]], 5], ""];
  if (id === "plan_phase") return ["concat", "LINE ", ["upcase", ["get", "line_id"]]];
  if (id === "areas") return ["upcase", ["get", "Region"]];
  return null;
}

function userSpecs(s: State): { src: string; data: FC; layers: LayerSpecification[] }[] {
  return s.userLayers.map((u) => {
    const src = `user-${u.id}`;
    const def: LayerDef = { id: src as LayerId, title: u.name, kind: u.kind, time: "none", cluster: "none", fields: [] };
    return { src, data: u.data, layers: specs(def, u.style, { ...s, filters: { geo: null, dv: null, chart: null } }, src) };
  });
}

function unitSpecs(s: State): LayerSpecification[] {
  if (!s.unit || s.page === "home") return [];
  const [nation, num] = s.unit.split("|");
  const f = ["all", ["==", ["get", "Nation"], nation], ["==", ["to-string", ["get", "Num_Name"]], num]];
  return [
    { id: "unit-track", type: "line", source: "unit-track", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": cssVar("--primary"), "line-width": 2.5, "line-dasharray": [1, 1.5] } },
    { id: "unit-paths", type: "line", source: "src-paths", filter: f as never,
      paint: { "line-color": cssVar("--primary"), "line-width": 4, "line-opacity": 0.55 } },
    { id: "unit-points", type: "circle", source: "src-points", filter: f as never,
      paint: { "circle-radius": 7, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": cssVar("--primary"), "circle-stroke-width": 2 } },
  ];
}

/** Unit track as a dated line through the unit's daily positions. */
export function unitTrack(s: State): FC {
  if (!s.unit || s.page === "home") return { type: "FeatureCollection", features: [] };
  const [nation, num] = s.unit.split("|");
  const pts = s.data.regions[s.page].points.features
    .filter((f) => f.properties?.Nation === nation && String(f.properties?.Num_Name) === num && f.geometry.type === "Point")
    .sort((a, b) => String(a.properties!.Date).localeCompare(String(b.properties!.Date)));
  const coords = pts.map((f) => (f.geometry as GeoJSON.Point).coordinates);
  return { type: "FeatureCollection", features: coords.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }] : [] };
}

const applied = new WeakMap<MLMap, Map<string, string>>();
const sourceObj = new WeakMap<MLMap, Map<string, unknown>>();
let basemapId: string | null = null;

function setSource(map: MLMap, id: string, data: unknown) {
  const known = sourceObj.get(map)!;
  if (known.get(id) === data && map.getSource(id)) return;
  const src = map.getSource(id) as GeoJSONSource | undefined;
  if (src) src.setData(data as FC);
  else map.addSource(id, { type: "geojson", data: data as FC });
  known.set(id, data);
}

function syncBasemap(map: MLMap, s: State) {
  map.setPaintProperty("bg", "background-color", cssVar("--background"));
  const key = `${s.basemap}:${s.theme}`;
  if (basemapId === key) return;
  for (const id of ["basemap", "basemap-tint"]) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource("basemap")) map.removeSource("basemap");
  const bm = BASEMAPS.find((b) => b.id === s.basemap);
  const before = map.getStyle().layers[1]?.id;
  if (bm && bm.tiles.length) {
    map.addSource("basemap", { type: "raster", tiles: bm.tiles, tileSize: 256, maxzoom: bm.maxzoom, attribution: bm.attribution });
    const period = s.theme === "period";
    map.addLayer({ id: "basemap", type: "raster", source: "basemap",
      paint: period ? { "raster-saturation": -0.75, "raster-contrast": -0.1, "raster-brightness-max": 0.95 } : {} }, before);
    if (period) map.addLayer({ id: "basemap-tint", type: "background", paint: { "background-color": "#c8b68a", "background-opacity": 0.28 } }, before);
  }
  basemapId = key;
}

/** The only function that writes sources, layers, paint, layout and filters to the map. */
export function syncLayers(map: MLMap, s: State) {
  if (!applied.has(map)) { applied.set(map, new Map()); sourceObj.set(map, new Map()); }
  const cache = applied.get(map)!;
  syncBasemap(map, s);

  setSource(map, "countries", COUNTRIES);
  const wanted: LayerSpecification[] = [
    { id: "countries", type: "line", source: "countries", paint: {
      "line-color": cssVar("--muted-foreground"), "line-opacity": s.basemap === "none" ? 0.8 : 0.25, "line-width": 0.8 } },
  ];

  for (const def of layersFor(s.page, s.showPlan)) {
    const data = sourceData(s, def.id);
    if (!data) continue;
    // Heatmap shares the points source; ids are stable per page so feature-state survives filter changes.
    const src = `src-${def.id === "heat" ? (s.page === "home" ? "overview" : "points") : def.id}`;
    setSource(map, src, data);
    wanted.push(...specs(def, styleOf(s, def.id), s, src));
  }
  setSource(map, "unit-track", unitTrack(s));
  wanted.push(...unitSpecs(s));
  for (const u of userSpecs(s)) { setSource(map, u.src, u.data); wanted.push(...u.layers); }
  // Labels last so they sit above every data layer.
  wanted.sort((a, b) => Number(a.type === "symbol") - Number(b.type === "symbol"));

  const wantedIds = new Set(wanted.map((l) => l.id));
  for (const id of [...cache.keys()]) if (!wantedIds.has(id)) { if (map.getLayer(id)) map.removeLayer(id); cache.delete(id); }

  for (const spec of wanted) {
    const sig = JSON.stringify(spec);
    if (cache.get(spec.id) === sig) continue;
    const prev = cache.get(spec.id);
    const prevSpec = prev ? (JSON.parse(prev) as LayerSpecification & { source?: string }) : null;
    if (!prevSpec || prevSpec.type !== spec.type || prevSpec.source !== (spec as { source?: string }).source || !map.getLayer(spec.id)) {
      if (map.getLayer(spec.id)) map.removeLayer(spec.id);
      map.addLayer(spec);
    } else {
      const p = spec as unknown as { paint?: Record<string, unknown>; layout?: Record<string, unknown>; filter?: unknown };
      const q = prevSpec as unknown as typeof p;
      for (const [k, v] of Object.entries(p.paint ?? {})) if (JSON.stringify(q.paint?.[k]) !== JSON.stringify(v)) map.setPaintProperty(spec.id, k, v);
      for (const k of Object.keys(q.paint ?? {})) if (!(k in (p.paint ?? {}))) map.setPaintProperty(spec.id, k, undefined);
      for (const [k, v] of Object.entries(p.layout ?? {})) if (JSON.stringify(q.layout?.[k]) !== JSON.stringify(v)) map.setLayoutProperty(spec.id, k, v);
      if (JSON.stringify(q.filter) !== JSON.stringify(p.filter)) map.setFilter(spec.id, (p.filter ?? null) as never);
    }
    cache.set(spec.id, sig);
  }
  // Keep z-order equal to `wanted` (addLayer appends, so re-adds can land out of order).
  for (const spec of wanted) map.moveLayer(spec.id);
}

/** Layer ids that respond to clicks, top-most first. */
export function clickableLayers(map: MLMap): string[] {
  const ids = ["unit-points", "points", "paths", "dv", "geo", "ellipses", "plan_phase", "plan_advance", "plan_pocket", "areas"];
  return ids.filter((id) => map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== "none");
}
