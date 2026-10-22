import type { Theme } from "@/state/store";

export interface Basemap { id: string; label: string; tiles: string[]; maxzoom: number; attribution: string }

const esri = (service: string) => `https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`;
const ESRI = "Esri, TomTom, Garmin, FAO, NOAA, USGS";

// Keyless raster services, so the single file needs no API keys.
export const BASEMAPS: Basemap[] = [
  { id: "dark", label: "Dark Gray", tiles: [esri("Canvas/World_Dark_Gray_Base")], maxzoom: 16, attribution: ESRI },
  { id: "light", label: "Light Gray", tiles: [esri("Canvas/World_Light_Gray_Base")], maxzoom: 16, attribution: ESRI },
  { id: "relief", label: "Shaded Relief", tiles: [esri("World_Shaded_Relief")], maxzoom: 13, attribution: ESRI },
  { id: "terrain", label: "Terrain", tiles: [esri("World_Terrain_Base")], maxzoom: 13, attribution: ESRI },
  { id: "topo", label: "Topographic", tiles: [esri("World_Topo_Map")], maxzoom: 18, attribution: ESRI },
  { id: "imagery", label: "Imagery", tiles: [esri("World_Imagery")], maxzoom: 18, attribution: "Esri, Maxar, Earthstar Geographics" },
  { id: "none", label: "None (offline outline)", tiles: [], maxzoom: 0, attribution: "" },
];

export const DEFAULT_BASEMAP: Record<Theme, string> = { tactical: "dark", period: "relief" };
export const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
export const FONT = ["Noto Sans Regular"];
