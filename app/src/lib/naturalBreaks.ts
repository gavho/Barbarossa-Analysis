// Natural breaks on a chosen date against a chosen phase line, ported from analysis/phase_distributions.py
// (jenks, natural_breaks, classify_bins, jenks_on_date) so the Phases tab can redo it for any date or redrawn line.
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature } from "geojson";
import { PLAN_MATCH, PHASE_PROFILES, type FC } from "@/data";
import { divKey, type Pt } from "./cluster";

type J = typeof PHASE_PROFILES.jenks;
export interface Breaks { summary: J["summary"][number]; bins: J["bins"]; dots: FC; breaklines: FC }

const fc = (features: Feature[]): FC => ({ type: "FeatureCollection", features });
const NATIONS = new Set(["Wehrmacht", "SS"]);
const GVF = 0.9, MIN_DIVISIONS = 5, FAR = 3000;
// Azimuthal equidistant at 50N 29E as the analysis (on a sphere; the flat projection.ts one moves near-tie Jenks cuts).
const R = 6371.0088, RAD = Math.PI / 180, L0 = 29 * RAD, P0 = 50 * RAD;
const proj = {
  to: ([lon, lat]: number[]): Pt => {
    const f = lat * RAD, dl = lon * RAD - L0;
    const c = Math.acos(Math.sin(P0) * Math.sin(f) + Math.cos(P0) * Math.cos(f) * Math.cos(dl)), k = c ? (R * c) / Math.sin(c) : R;
    return [k * Math.cos(f) * Math.sin(dl), k * (Math.cos(P0) * Math.sin(f) - Math.sin(P0) * Math.cos(f) * Math.cos(dl))];
  },
  from: ([x, y]: Pt): Pt => {
    const r = Math.hypot(x, y), c = r / R;
    if (!r) return [29, 50];
    const f = Math.asin(Math.cos(c) * Math.sin(P0) + (y * Math.sin(c) * Math.cos(P0)) / r);
    return [(L0 + Math.atan2(x * Math.sin(c), r * Math.cos(P0) * Math.cos(c) - y * Math.sin(P0) * Math.sin(c))) / RAD, f / RAD];
  },
};

/** Weighted-free Fisher-Jenks: k-1 breaks (midway between classes) with the least within-class sum of squares, and GVF. */
export function jenks(values: number[], k: number): { breaks: number[]; gvf: number } {
  const v = [...values].sort((a, b) => a - b), n = v.length;
  const S = [0], Q = [0];
  v.forEach((x, i) => { S.push(S[i] + x); Q.push(Q[i] + x * x); });
  const ss = (i: number, j: number) => Q[j] - Q[i] - (S[j] - S[i]) ** 2 / (j - i);
  const cost = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(Infinity)), back = cost.map((r) => r.map(() => 0));
  cost[0][0] = 0;
  for (let c = 1; c <= k; c++)
    for (let j = c; j <= n; j++)
      for (let i = c - 1; i < j; i++) {
        const t = cost[c - 1][i] + ss(i, j);
        if (t < cost[c][j]) { cost[c][j] = t; back[c][j] = i; }
      }
  const breaks: number[] = [];
  for (let c = k, j = n; c > 1; c--) { const i = back[c][j]; breaks.push((v[i - 1] + v[i]) / 2); j = i; }
  return { breaks: breaks.sort((a, b) => a - b), gvf: 1 - cost[k][n] / ss(0, n) };
}

/** Fewest classes (2-5) explaining at least gvfMin of the spread. */
export function naturalBreaks(values: number[], gvfMin = GVF) {
  let r = jenks(values, 2), k = 2;
  for (; k < 5 && r.gvf < gvfMin; k++) r = jenks(values, k + 1);
  return { k, ...r };
}

/** Each division's strength-weighted mean position (km) per day, as analysis/phase_checkpoints.daily_tracks. */
function dailyTracks(points: FC) {
  const acc = new Map<string, Map<string, [number, number, number]>>();
  for (const f of points.features) {
    const p = f.properties ?? {};
    if (!NATIONS.has(String(p.Nation)) || f.geometry?.type !== "Point") continue;
    const [x, y] = proj.to(f.geometry.coordinates), w = Number(p.Frac_Unit ?? 1) || 1, k = divKey(p), d = String(p.Date);
    const days = acc.get(k) ?? acc.set(k, new Map()).get(k)!;
    const a = days.get(d) ?? [0, 0, 0];
    days.set(d, [a[0] + x * w, a[1] + y * w, a[2] + w]);
  }
  const out = new Map<string, Map<string, Pt>>();
  for (const [k, days] of acc) if (days.size >= 2)
    out.set(k, new Map([...days].sort(([a], [b]) => a.localeCompare(b)).map(([d, [x, y, w]]) => [d, [x / w, y / w]])));
  return out;
}

const cache = new WeakMap<FC, { tracks: ReturnType<typeof dailyTracks>; first: Pt; u: Pt }>();
/** The general direction of the whole advance: mean first position → mean last position. */
function axis(points: FC) {
  if (!cache.has(points)) {
    const tracks = dailyTracks(points), ends = [...tracks.values()].map((t) => [...t.values()]);
    const mean = (ps: Pt[]): Pt => [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length];
    const first = mean(ends.map((e) => e[0])), last = mean(ends.map((e) => e[e.length - 1]));
    const L = Math.hypot(last[0] - first[0], last[1] - first[1]);
    cache.set(points, { tracks, first, u: [(last[0] - first[0]) / L, (last[1] - first[1]) / L] });
  }
  return cache.get(points)!;
}

/** A line at least twice as far east as north (the OKH 4th line), as analysis/phase_clusters.west_east. */
const westEast = (a: Pt, b: Pt) => Math.abs(b[0] - a[0]) > 2 * Math.abs(b[1] - a[1]);

/** A phase line (km) ordered and extended so every position is short of it or past it, the region past it, and the unit
 * vector at right angles to it pointing past it (as phase_clusters.phase_lines, east_polygon and line_normal).
 * North-south lines: north end first, extended north and south, past = east. West-east lines: east end first, extended
 * east and south, past = south of it and east of its west end. */
export function pastSide(km: Pt[]) {
  let c = km;
  let ext: Pt[];
  if (westEast(c[0], c[c.length - 1])) {
    if (c[0][0] < c[c.length - 1][0]) c = [...c].reverse();
    const e = c[0], w = c[c.length - 1];
    ext = [[e[0] + FAR, e[1]], ...c, [w[0], w[1] - FAR]];
  } else {
    if (c[0][1] < c[c.length - 1][1]) c = [...c].reverse();
    const n = c[0], s = c[c.length - 1];
    ext = [[n[0], n[1] + FAR], ...c, [s[0], s[1] - FAR]];
  }
  const a = ext[0], b = ext[ext.length - 1];
  const poly = { type: "Polygon" as const, coordinates: [[...ext, [b[0] + FAR, b[1]], [a[0] + FAR, a[1]], a]] };
  const [p0, p1] = [c[0], c[c.length - 1]], L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const nrm: Pt = [-(p1[1] - p0[1]) / L, (p1[0] - p0[0]) / L];
  const mid = halfway(c);
  const u: Pt = booleanPointInPolygon([mid[0] + 20 * nrm[0], mid[1] + 20 * nrm[1]], poly) ? nrm : [-nrm[0], -nrm[1]];
  return { drawn: c, poly, u };
}

/** The point halfway along a polyline. */
function halfway(c: Pt[]): Pt {
  const seg = c.slice(1).map((p, i) => Math.hypot(p[0] - c[i][0], p[1] - c[i][1]));
  let left = seg.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i]) { const t = seg[i] ? left / seg[i] : 0; return [c[i][0] + t * (c[i + 1][0] - c[i][0]), c[i][1] + t * (c[i + 1][1] - c[i][1])]; }
    left -= seg[i];
  }
  return c[c.length - 1];
}

/** Natural breaks of the divisions on `date`, read against `line` (lon/lat, any direction); null if under 5 divisions.
 * Positions are measured at right angles to the line (from the mean 22 June position), so a west-east line is
 * measured southward: the whole advance's ~101 deg heading runs almost along the OKH 4th line. */
export function breaksOnDate(points: FC, line: number[][], date: string, phase: string): Breaks | null {
  const { tracks, first } = axis(points);
  const keys = [...tracks.keys()].filter((k) => tracks.get(k)!.has(date));
  if (keys.length < MIN_DIVISIONS || line.length < 2) return null;
  const { drawn: km, poly, u } = pastSide(line.map(proj.to)), across: Pt = [-u[1], u[0]];
  const xy = keys.map((k) => tracks.get(k)!.get(date)!);
  const dot = (p: Pt, v: Pt) => (p[0] - first[0]) * v[0] + (p[1] - first[1]) * v[1];
  const along = xy.map((p) => dot(p, u));
  const past = xy.map((p) => booleanPointInPolygon(p, poly));

  const { k, breaks, gvf } = naturalBreaks(along);
  const bins = along.map((a) => k - breaks.filter((b) => b <= a).length); // 1 = furthest along the advance
  const cls = new Map<number, "past" | "straddling" | "behind">();
  for (let b = 1; b <= k; b++) {
    const on = past.filter((_, i) => bins[i] === b);
    if (on.length) cls.set(b, on.every(Boolean) ? "past" : on.some(Boolean) ? "straddling" : "behind");
  }
  const rows = [...cls].map(([bin, c]) => {
    const a = along.filter((_, i) => bins[i] === bin);
    return { phase, date, bin, from_km: Math.round(Math.min(...a)), to_km: Math.round(Math.max(...a)), divisions: a.length,
      past: past.filter((x, i) => x && bins[i] === bin).length, class: c };
  });
  const share = (c: string) => Math.round((100 * rows.filter((r) => r.class === c).reduce((t, r) => t + r.divisions, 0)) / along.length);
  const lineAlong = km.map((p) => dot(p, u)), side = xy.map((p) => dot(p, across));
  const ll = (p: Pt) => proj.from(p).map((v) => Math.round(v * 1e5) / 1e5);
  return {
    summary: { phase, date, heading: Math.round(((Math.atan2(u[0], u[1]) / RAD) + 360) % 360), divisions: along.length, bins: k, gvf: Math.round(gvf * 100) / 100, past: share("past"),
      straddling: share("straddling"), behind: share("behind"), line_from: Math.round(Math.min(...lineAlong)), line_to: Math.round(Math.max(...lineAlong)) },
    bins: rows,
    breaklines: fc(breaks.map((b) => ({ type: "Feature", properties: { phase, km: Math.round(b) }, geometry: { type: "LineString",
      coordinates: [Math.min(...side) - 30, Math.max(...side) + 30].map((w) => ll([first[0] + b * u[0] + w * across[0], first[1] + b * u[1] + w * across[1]])) } }))),
    dots: fc(keys.map((key, i) => ({ type: "Feature", id: i, properties: { division: PLAN_MATCH.names[key] ?? key.split("|").reverse().join(" "), phase, date,
      bin: bins[i], class: cls.get(bins[i]), km: Math.round(along[i]), past: past[i] }, geometry: { type: "Point", coordinates: ll(xy[i]) } }))),
  };
}
