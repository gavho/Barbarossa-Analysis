import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature, LineString, MultiLineString, Polygon } from "geojson";
import { daysBetween } from "./dates";

const EAST = 60; // far enough east to close the polygon beyond the theater
/** A unit this close short of a phase line counts as having reached it: the same 20 km as the mapping-error band,
 * since positions closer than that cannot be told apart from "on the line". */
export const REACH_KM = 20;

/** Shortest distance (km) from a lon/lat point to a lon/lat polyline, on a local flat-earth plane (error < 1% under 100 km). */
export function distanceToLineKm(p: number[], line: number[][]): number {
  const kx = Math.cos((p[1] * Math.PI) / 180) * 111.32, ky = 110.57;
  const px = p[0] * kx, py = p[1] * ky;
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const ax = line[i][0] * kx, ay = line[i][1] * ky, dx = line[i + 1][0] * kx - ax, dy = line[i + 1][1] * ky - ay;
    const L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
  }
  return best;
}

const SOUTH = 40; // far enough south to close the polygon below the theater

/** A line at least twice as far east as north on the ground (the OKH 4th line), as analysis/phase_clusters.west_east. */
export function runsWestEast(line: number[][]): boolean {
  const a = line[0], b = line[line.length - 1], kx = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180) * 111.32;
  return Math.abs((b[0] - a[0]) * kx) > 2 * Math.abs((b[1] - a[1]) * 110.57);
}

/** Past a phase line, within its own span: east of a roughly north–south line (within its latitudes), or south of a
 * west–east one (within its longitudes), which the divisions crossed moving south. */
export function pastOf(line: number[][]): { poly: Feature<Polygon>; inBand: (c: number[]) => boolean } {
  const we = runsWestEast(line), k = we ? 0 : 1;
  const first = line[0], last = line[line.length - 1];
  const close = we ? [[last[0], SOUTH], [first[0], SOUTH]] : [[EAST, last[1]], [EAST, first[1]]];
  const vals = line.map((c) => c[k]), lo = Math.min(...vals), hi = Math.max(...vals);
  return { poly: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...line, ...close, first]] } },
    inBand: (c) => c[k] >= lo && c[k] <= hi };
}

export interface Crossing {
  lineId: string;
  name: string;
  planned: string;
  plannedEnd: string | null;
  lead: string | null; // first day any unit in the line's band (latitudes, or longitudes for a west-east line) had reached it (past it or within reach)
  main: string | null; // first day at least half of that day's units in the band had reached it
  shareToday: number | null; // share of the selected day's units in the band that had reached it
  delay: number | null; // main-body day minus planned end, in days (+ = late)
}

/** When the division points actually reached each planned phase line: east of it, or no more than reachKm short of it. */
export function crossings(phaseLines: Feature[], points: Feature[], today: string, reachKm = REACH_KM): Crossing[] {
  const byDay = new Map<string, number[][]>();
  for (const f of points) {
    if (f.geometry?.type !== "Point") continue;
    const d = String(f.properties?.Date);
    byDay.set(d, [...(byDay.get(d) ?? []), f.geometry.coordinates]);
  }
  const days = [...byDay.keys()].sort();

  return phaseLines.map((pl) => {
    const g = pl.geometry as LineString | MultiLineString;
    const line = g.type === "LineString" ? g.coordinates : g.coordinates.flat();
    const { poly, inBand } = pastOf(line);
    const share = (d: string) => {
      const pts = (byDay.get(d) ?? []).filter(inBand);
      if (!pts.length) return null;
      return pts.filter((c) => booleanPointInPolygon(c, poly) || distanceToLineKm(c, line) <= reachKm).length / pts.length;
    };
    let lead: string | null = null, main: string | null = null;
    for (const d of days) {
      const sh = share(d);
      if (sh === null) continue;
      if (!lead && sh > 0) lead = d;
      if (!main && sh >= 0.5) { main = d; break; }
    }
    const p = pl.properties ?? {};
    const plannedEnd = (p.date_end as string) ?? null;
    return {
      lineId: String(p.line_id), name: String(p.name), planned: String(p.planned_date ?? ""), plannedEnd,
      lead, main, shareToday: share(today), delay: main && plannedEnd ? daysBetween(plannedEnd, main) : null,
    };
  });
}
