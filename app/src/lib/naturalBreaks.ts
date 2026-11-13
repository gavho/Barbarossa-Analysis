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

/** Natural breaks of the divisions on `date`, read against `line` (lon/lat, any direction); null if under 5 divisions. */
export function breaksOnDate(points: FC, line: number[][], date: string, phase: string): Breaks | null {
  const { tracks, first, u } = axis(points), across: Pt = [-u[1], u[0]];
  const keys = [...tracks.keys()].filter((k) => tracks.get(k)!.has(date));
  if (keys.length < MIN_DIVISIONS || line.length < 2) return null;
  const xy = keys.map((k) => tracks.get(k)!.get(date)!);
  const dot = (p: Pt, v: Pt) => (p[0] - first[0]) * v[0] + (p[1] - first[1]) * v[1];
  const along = xy.map((p) => dot(p, u));

  let km = line.map(proj.to);
  if (km[0][1] < km[km.length - 1][1]) km = km.reverse(); // north end first
  const n = km[0], s = km[km.length - 1];
  const ext = [[n[0], n[1] + FAR], ...km, [s[0], s[1] - FAR]];
  const east = { type: "Polygon" as const, coordinates: [[...ext, [s[0] + FAR, s[1] - FAR], [n[0] + FAR, n[1] + FAR], ext[0]]] };
  const past = xy.map((p) => booleanPointInPolygon(p, east));

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
    summary: { phase, date, divisions: along.length, bins: k, gvf: Math.round(gvf * 100) / 100, past: share("past"),
      straddling: share("straddling"), behind: share("behind"), line_from: Math.round(Math.min(...lineAlong)), line_to: Math.round(Math.max(...lineAlong)) },
    bins: rows,
    breaklines: fc(breaks.map((b) => ({ type: "Feature", properties: { phase, km: Math.round(b) }, geometry: { type: "LineString",
      coordinates: [Math.min(...side) - 30, Math.max(...side) + 30].map((w) => ll([first[0] + b * u[0] + w * across[0], first[1] + b * u[1] + w * across[1]])) } }))),
    dots: fc(keys.map((key, i) => ({ type: "Feature", id: i, properties: { division: PLAN_MATCH.names[key] ?? key.split("|").reverse().join(" "), phase, date,
      bin: bins[i], class: cls.get(bins[i]), km: Math.round(along[i]), past: past[i] }, geometry: { type: "Point", coordinates: ll(xy[i]) } }))),
  };
}
