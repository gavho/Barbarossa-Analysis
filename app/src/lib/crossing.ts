import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature, LineString, MultiLineString, Polygon } from "geojson";
import { daysBetween } from "./dates";

const EAST = 60; // far enough east to close the polygon beyond the theater

/** The region east of a roughly north–south phase line, within the line's own latitude span. */
export function eastOf(line: number[][]): Feature<Polygon> {
  const first = line[0], last = line[line.length - 1];
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...line, [EAST, last[1]], [EAST, first[1]], first]] } };
}

export interface Crossing {
  lineId: string;
  name: string;
  planned: string;
  plannedEnd: string | null;
  lead: string | null; // first day any unit in the line's latitude band was east of it
  main: string | null; // first day at least half of that day's units in the band were east of it
  shareToday: number | null;
  delay: number | null; // main-body day minus planned end, in days (+ = late)
}

/** When the division points actually passed each planned phase line. */
export function crossings(phaseLines: Feature[], points: Feature[], today: string): Crossing[] {
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
    const poly = eastOf(line);
    const lats = line.map((c) => c[1]);
    const [lo, hi] = [Math.min(...lats), Math.max(...lats)];
    const share = (d: string) => {
      const pts = (byDay.get(d) ?? []).filter((c) => c[1] >= lo && c[1] <= hi);
      if (!pts.length) return null;
      return pts.filter((c) => booleanPointInPolygon(c, poly)).length / pts.length;
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
