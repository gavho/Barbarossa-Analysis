import { useEffect, useRef } from "react";
import maplibregl, { type Map as MLMap, type MapGeoJSONFeature } from "maplibre-gl";
import { get, set, useStore } from "@/state/store";
import { layersFor } from "@/config/presets";
import { pageBounds } from "@/config/regions";
import { GLYPHS } from "./basemaps";
import { clickableLayers, syncLayers } from "./syncLayers";

/** The one live map; exports and the presenter reach it through here. */
export let mapRef: MLMap | null = null;

let selected: { source: string; id: number } | null = null;
function markSelected(map: MLMap, f: MapGeoJSONFeature | null) {
  if (selected && map.getSource(selected.source)) map.setFeatureState(selected, { selected: false });
  selected = f && typeof f.id === "number" ? { source: f.source, id: f.id } : null;
  if (selected) map.setFeatureState(selected, { selected: true });
}

export function MapView() {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = get();
    const map = new maplibregl.Map({
      container: el.current!,
      style: { version: 8, glyphs: GLYPHS, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#0a0a0b" } }] },
      bounds: pageBounds(s.page),
      fitBoundsOptions: { padding: 30 },
      attributionControl: { compact: true },
      canvasContextAttributes: { preserveDrawingBuffer: true }, // map PNG/PDF export reads the canvas
    });
    mapRef = map;
    (window as unknown as { __map: MLMap }).__map = map; // debugging handle for the browser console
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.addControl(new maplibregl.FullscreenControl(), "top-right");

    let ready = false; // isStyleLoaded() flickers false while GeoJSON sources parse, so track load once
    map.on("load", () => {
      ready = true;
      syncLayers(map, get());
      if (s.view) map.jumpTo(s.view);
    });
    const unsub = useStore.subscribe((now, prev) => {
      if (!ready) return;
      const keys = ["page", "mode", "date", "theme", "basemap", "styles", "filters", "showPlan", "unit", "userLayers", "data"] as const;
      if (keys.some((k) => now[k] !== prev[k])) syncLayers(map, now);
      if (now.page !== prev.page && !now.presenting) {
        markSelected(map, null);
        map.fitBounds(pageBounds(now.page), { padding: 30, duration: 900 });
      }
      if (now.selection === null && prev.selection !== null) markSelected(map, null);
    });
    // The theme swaps CSS variables; resync so map colors read the new values.
    const themeObserver = new MutationObserver(() => ready && syncLayers(map, get()));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    map.on("click", (e) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: clickableLayers(map) });
      const f = hits[0];
      markSelected(map, f ?? null);
      if (!f) return set({ selection: null });
      const layer = f.layer.id === "unit-points" ? "points" : f.layer.id;
      const title = layersFor(get().page, true).find((d) => d.id === layer)?.title ?? layer;
      set({ selection: { layer, title, props: { ...f.properties } }, rightOpen: true, rightTab: "info" });
    });
    map.on("mousemove", (e) => {
      const n = map.queryRenderedFeatures(e.point, { layers: clickableLayers(map) }).length;
      map.getCanvas().style.cursor = n ? "pointer" : "";
    });
    map.on("moveend", () => {
      const c = map.getCenter();
      set({ view: { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() } });
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el.current!);
    return () => { unsub(); themeObserver.disconnect(); ro.disconnect(); map.remove(); mapRef = null; };
  }, []);

  // maplibre's unlayered CSS forces `position: relative` on the map element, so position a wrapper instead.
  return (
    <div className="absolute inset-0">
      <div ref={el} style={{ width: "100%", height: "100%" }} aria-label="Map" role="region" />
    </div>
  );
}
