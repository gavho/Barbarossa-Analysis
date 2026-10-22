import type { Feature } from "geojson";
import type { FC } from "@/data";
import { get, set, toast, type UserLayer } from "@/state/store";
import { openWorkspaceFile } from "./workspace";

const COLORS = ["#ffb224", "#12a594", "#d6409f", "#3e8ed0", "#e5484d"];

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

export function csvToPoints(text: string): FC {
  const [head, ...rows] = parseCsv(text);
  const find = (re: RegExp) => head.findIndex((h) => re.test(h.trim()));
  const lat = find(/^(lat|latitude|y)$/i), lon = find(/^(lon|lng|long|longitude|x)$/i);
  if (lat < 0 || lon < 0) throw new Error("CSV needs lat/latitude and lon/longitude columns");
  const features: Feature[] = [];
  rows.forEach((r, i) => {
    const y = Number(r[lat]), x = Number(r[lon]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(y) > 90 || Math.abs(x) > 180) return;
    const props = Object.fromEntries(head.map((h, j) => [h, r[j] !== "" && !Number.isNaN(Number(r[j])) ? Number(r[j]) : r[j]]));
    features.push({ type: "Feature", id: i, properties: props, geometry: { type: "Point", coordinates: [x, y] } });
  });
  return { type: "FeatureCollection", features };
}

function kindOf(fc: FC): UserLayer["kind"] {
  const t = fc.features.find((f) => f.geometry)?.geometry.type ?? "Point";
  return t.includes("Polygon") ? "fill" : t.includes("Line") ? "line" : "circle";
}

/** Load dropped or picked files: workspaces open, GeoJSON/CSV become user layers. */
export async function loadFiles(files: FileList | File[]) {
  for (const file of Array.from(files)) {
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith(".barbarossa.json")) { await openWorkspaceFile(file); continue; }
      let fc: FC;
      if (name.endsWith(".csv")) fc = csvToPoints(await file.text());
      else if (name.endsWith(".geojson") || name.endsWith(".json")) {
        const j = JSON.parse(await file.text());
        if (j.app === "Barbarossa") { await openWorkspaceFile(file); continue; }
        fc = j.type === "FeatureCollection" ? j : j.type === "Feature" ? { type: "FeatureCollection", features: [j] } : (() => { throw new Error("not GeoJSON"); })();
      } else throw new Error("unsupported type (use .geojson, .json, .csv or .barbarossa.json)");
      if (!fc.features.length) throw new Error("no features");
      fc.features.forEach((f, i) => (f.id = i));
      const n = get().userLayers.length;
      const kind = kindOf(fc);
      const layer: UserLayer = {
        id: `${Date.now().toString(36)}${n}`, name: file.name.replace(/\.[^.]+$/, ""), kind, data: fc,
        style: { visible: true, opacity: kind === "fill" ? 0.35 : 0.9, colorMode: "single", color: COLORS[n % COLORS.length], size: kind === "circle" ? [5, 5] : [2, 2], outline: "#000" },
      };
      set({ userLayers: [...get().userLayers, layer] });
      toast(`Added ${layer.name} (${fc.features.length} features)`, "ok");
    } catch (e) {
      toast(`Could not load ${file.name}: ${(e as Error).message}`, "error");
    }
  }
}
