import type { Feature } from "geojson";
import { layersFor, type LayerId } from "@/config/presets";
import type { RegionId } from "@/config/regions";
import { matches } from "@/map/expressions";
import { sourceData } from "@/map/syncLayers";
import { unitKey, type State } from "@/state/store";

/** Features of a layer that pass the same time / cluster / chart filters the map applies. */
export function visibleFeatures(s: State, id: LayerId, bounds?: [number, number, number, number]): Feature[] {
  const def = layersFor(s.page, true).find((d) => d.id === id);
  const data = sourceData(s, id);
  if (!def || !data) return [];
  return data.features.filter((f) => {
    if (!matches(f.properties ?? {}, def.time, def.cluster, s.mode, s.date, s.filters, id === "points")) return false;
    if (!bounds) return true;
    const [w, so, e, n] = bounds;
    return someCoord(f.geometry, ([x, y]) => x >= w && x <= e && y >= so && y <= n);
  });
}

function someCoord(g: Feature["geometry"], test: (c: number[]) => boolean): boolean {
  if (!g) return false;
  if (g.type === "GeometryCollection") return g.geometries.some((x) => someCoord(x, test));
  const walk = (c: unknown): boolean => (typeof (c as number[])[0] === "number" ? test(c as number[]) : (c as unknown[]).some(walk));
  return walk(g.coordinates);
}

/** Count features by a property, in a fixed key order when given. */
export function countBy(features: Feature[], field: string, order?: string[]): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const f of features) {
    const k = String(f.properties?.[field] ?? "—");
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  const keys = order ? [...order.filter((k) => m.has(k)), ...[...m.keys()].filter((k) => !order.includes(k))] : [...m.keys()].sort();
  return keys.map((key) => ({ key, count: m.get(key)! }));
}

export interface Unit { key: string; nation: string; num: number; branch: string; unitType: string; days: number; first: string; last: string }

/** Every division seen in a region's points, with its branch and active span. */
export function unitsOf(s: State, region: RegionId): Unit[] {
  const m = new Map<string, Unit>();
  for (const f of s.data.regions[region].points.features) {
    const p = f.properties ?? {};
    const key = unitKey(p.Nation, p.Num_Name);
    const u = m.get(key);
    if (!u) m.set(key, { key, nation: String(p.Nation), num: Number(p.Num_Name), branch: String(p.Branch_Type ?? "—"),
      unitType: String(p.Unit_Type ?? ""), days: 1, first: p.Date, last: p.Date });
    else { u.days++; if (p.Date < u.first) u.first = p.Date; if (p.Date > u.last) u.last = p.Date; }
  }
  return [...m.values()].sort((a, b) => a.nation.localeCompare(b.nation) || a.num - b.num);
}

/** A unit's daily records in date order. */
export function unitRecords(s: State, region: RegionId, key: string): Feature[] {
  const [nation, num] = key.split("|");
  return s.data.regions[region].points.features
    .filter((f) => f.properties?.Nation === nation && String(f.properties?.Num_Name) === num)
    .sort((a, b) => String(a.properties!.Date).localeCompare(String(b.properties!.Date)));
}
