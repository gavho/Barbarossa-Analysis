// Live re-clustering of division paths in the browser, mirroring analysis/phase_clusters.py and analysis/compare_loa.py:
//   DV  = k-means on [end x, end y, centroid x, centroid y]
//   GEO = symmetric Hausdorff distance -> average-linkage agglomerative clustering
// and the paper's average path (members resampled to 50 points by length, averaged point by point).
// Coordinates are local km (equirectangular about the theatre's centre); Python uses an azimuthal-equidistant projection,
// so distances differ by a few km at most over a theatre.
import type { Feature, Geometry } from "geojson";
import type { FC } from "@/data";

export type Pt = [number, number];
export interface ClusterSettings { preset: "published" | "recommended" | "custom"; dvK: number; geoK: number; minMoveKm: number }
export const PUBLISHED: ClusterSettings = { preset: "published", dvK: 5, geoK: 5, minMoveKm: 0 };
export const RECOMMENDED: ClusterSettings = { preset: "recommended", dvK: 4, geoK: 4, minMoveKm: 200 };
export interface MethodInfo { k: number; sizes: number[]; silhouette: number }
export interface ClusterInfo { dv: MethodInfo; geo: MethodInfo; stayedBehind: string[]; members: { dv: Map<string, number>; geo: Map<string, number> } }

// ---------------------------------------------------------------- geometry
const R = 6371.0088, RAD = Math.PI / 180;
export interface Projection { to: (ll: number[]) => Pt; from: (p: Pt) => Pt }
export function projection(lon0: number, lat0: number): Projection {
  const kx = Math.cos(lat0 * RAD) * R * RAD, ky = R * RAD;
  return { to: ([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * ky], from: ([x, y]) => [lon0 + x / kx, lat0 + y / ky] };
}
export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const length = (pts: Pt[]) => pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0);

/** n points evenly spaced along the line (by length), with any per-vertex values (e.g. day numbers) interpolated too. */
export function resample(pts: Pt[], n: number, vals?: number[]): { pts: Pt[]; vals: number[] } {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  const L = cum[cum.length - 1], out: Pt[] = [], ov: number[] = [];
  let j = 0;
  for (let s = 0; s < n; s++) {
    const d = (L * s) / (n - 1);
    while (j < pts.length - 2 && cum[j + 1] < d) j++;
    const seg = cum[j + 1] - cum[j], t = seg > 0 ? Math.min(1, Math.max(0, (d - cum[j]) / seg)) : 0;
    out.push([pts[j][0] + t * (pts[j + 1][0] - pts[j][0]), pts[j][1] + t * (pts[j + 1][1] - pts[j][1])]);
    if (vals) ov.push(vals[j] + t * (vals[j + 1] - vals[j]));
  }
  return { pts: out, vals: ov };
}

/** Nearest point on a polyline to p. */
export function nearest(line: Pt[], p: Pt): Pt {
  let best: Pt = line[0], bd = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], ab: Pt = [b[0] - a[0], b[1] - a[1]];
    const L2 = ab[0] ** 2 + ab[1] ** 2;
    const t = L2 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / L2)) : 0;
    const q: Pt = [a[0] + t * ab[0], a[1] + t * ab[1]], d = dist(p, q);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

// ---------------------------------------------------------------- division tracks
export const divKey = (p: Record<string, unknown>) => `${p.Nation}|${p.Branch ?? p.Branch_Type}|${p.Num_Name}`;
const DAY = 86_400_000;
export const dayOf = (iso: string) => Math.floor(Date.parse(String(iso).slice(0, 10)) / DAY);
export const isoOf = (day: number) => new Date(Math.round(day) * DAY).toISOString().slice(0, 10);

export interface Track { key: string; pts: Pt[]; days: number[] }
function lines(g: Geometry | null): number[][][] {
  if (!g) return [];
  return g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
}

/** Each division's full path (its dated segments joined in Start_Date order), with a day number at every vertex. */
export function tracks(paths: FC, proj: Projection): Track[] {
  const by = new Map<string, Feature[]>();
  for (const f of paths.features) {
    const k = divKey(f.properties ?? {});
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(f);
  }
  const out: Track[] = [];
  for (const [key, fs] of by) {
    fs.sort((a, b) => String(a.properties?.Start_Date).localeCompare(String(b.properties?.Start_Date)));
    const pts: Pt[] = [], days: number[] = [];
    for (const f of fs) {
      const d0 = dayOf(String(f.properties?.Start_Date)), d1 = dayOf(String(f.properties?.End_Date ?? f.properties?.Start_Date));
      for (const part of lines(f.geometry)) {
        const seg = part.map(proj.to), L = length(seg);
        let run = 0;
        seg.forEach((q, i) => {
          if (i) run += dist(seg[i - 1], q);
          if (pts.length && dist(pts[pts.length - 1], q) < 1e-6) return;
          pts.push(q);
          days.push(L > 0 ? d0 + ((d1 - d0) * run) / L : d0);
        });
      }
    }
    if (pts.length > 1) out.push({ key, pts, days });
  }
  return out;
}

// ---------------------------------------------------------------- the two methods
function rng(seed: number) { // mulberry32: deterministic, so the same settings always give the same groups
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const sq = (a: number[], b: number[]) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);

/** k-means (k-means++ starts, Lloyd iterations), best of `starts` runs by inertia. */
export function kmeans(X: number[][], k: number, seed = 42, starts = 20): number[] {
  const rand = rng(seed);
  let best: number[] = [], bestI = Infinity;
  for (let s = 0; s < starts; s++) {
    const C = [X[Math.floor(rand() * X.length)]];
    while (C.length < k) {
      const d = X.map((x) => Math.min(...C.map((c) => sq(x, c))));
      let r = rand() * d.reduce((a, b) => a + b, 0), i = 0;
      while (r > d[i] && i < X.length - 1) r -= d[i++];
      C.push(X[i]);
    }
    let lab = X.map(() => 0);
    for (let it = 0; it < 100; it++) {
      const next = X.map((x) => C.reduce((bi, c, ci) => (sq(x, c) < sq(x, C[bi]) ? ci : bi), 0));
      const moved = next.some((l, i) => l !== lab[i]);
      lab = next;
      for (let c = 0; c < k; c++) {
        const m = X.filter((_, i) => lab[i] === c);
        if (m.length) C[c] = m[0].map((_, j) => m.reduce((a, x) => a + x[j], 0) / m.length);
      }
      if (!moved && it) break;
    }
    const inertia = X.reduce((a, x, i) => a + sq(x, C[lab[i]]), 0);
    if (inertia < bestI) { bestI = inertia; best = lab; }
  }
  return best;
}

export function hausdorff(a: Pt[], b: Pt[]): number {
  const dir = (p: Pt[], q: Pt[]) => { // plain loops: this runs ~3,000 times per re-clustering
    let worst = 0;
    for (const x of p) {
      let near = Infinity;
      for (const y of q) { const d = (x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2; if (d < near) near = d; }
      if (near > worst) worst = near;
    }
    return Math.sqrt(worst);
  };
  return Math.max(dir(a, b), dir(b, a));
}

/** Average-linkage agglomerative clustering on a distance matrix (Lance-Williams updates). */
export function agglomerative(D: number[][], k: number): number[] {
  let groups = D.map((_, i) => [i]);
  let M = D.map((r) => r.slice());
  while (groups.length > k) {
    let bi = 0, bj = 1, bd = Infinity;
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) if (M[i][j] < bd) { bd = M[i][j]; bi = i; bj = j; }
    const na = groups[bi].length, nb = groups[bj].length;
    const row = M.map((r, c) => (na * r[bi] + nb * r[bj]) / (na + nb));
    groups[bi] = [...groups[bi], ...groups[bj]];
    groups.splice(bj, 1);
    M = M.map((r, i) => (i === bi ? row : r.map((v, c) => (c === bi ? row[i] : v)))).filter((_, i) => i !== bj).map((r) => r.filter((_, c) => c !== bj));
    M[bi][bi] = 0;
  }
  const lab = D.map(() => 0);
  groups.forEach((g, c) => g.forEach((i) => (lab[i] = c)));
  return lab;
}

/** Mean silhouette over all items (0 for an item alone in its group, as in scikit-learn). */
export function silhouette(D: number[][], lab: number[]): number {
  const s = lab.map((l, i) => {
    const mean = (c: number) => { const o = lab.map((m, j) => (m === c && j !== i ? D[i][j] : NaN)).filter((v) => !isNaN(v)); return o.length ? o.reduce((a, b) => a + b, 0) / o.length : NaN; };
    if (lab.filter((m) => m === l).length < 2) return 0;
    const a = mean(l), b = Math.min(...[...new Set(lab)].filter((c) => c !== l).map(mean));
    return (b - a) / Math.max(a, b);
  });
  return s.reduce((a, b) => a + b, 0) / s.length;
}

// ---------------------------------------------------------------- average paths in the app's schema
/** The paper's average path: members resampled to 50 points by length and averaged, with their days averaged too. */
export function averagePath(members: Track[], n = 50): { pts: Pt[]; days: number[] } {
  const rs = members.map((t) => resample(t.pts, n, t.days));
  const pts = Array.from({ length: n }, (_, i) => [0, 1].map((j) => rs.reduce((a, r) => a + r.pts[i][j], 0) / rs.length) as Pt);
  const days = Array.from({ length: n }, (_, i) => rs.reduce((a, r) => a + r.vals[i], 0) / rs.length);
  return { pts, days };
}

/** Split an average path into one segment per day, with the fields the published cluster-path layers carry. */
export function dailySegments(avg: { pts: Pt[]; days: number[] }, cid: number, members: number, proj: Projection): Feature[] {
  const out: Feature[] = [];
  const day = avg.days.map(Math.round), first = day[0];
  let cum = 0, start = 0;
  for (let i = 1; i <= avg.pts.length; i++) {
    if (i < avg.pts.length && day[i] === day[start]) continue;
    const seg = avg.pts.slice(start, Math.min(i + 1, avg.pts.length));
    if (seg.length >= 2) {
      const km = length(seg);
      cum += km;
      const date = isoOf(day[start]);
      out.push({ type: "Feature", properties: { Cluster_ID: cid, Day_Index: day[start] - first + 1, Date: date, Start_Date: date, End_Date: date,
        Speed_km_day: Math.round(km * 10) / 10, Cumulative_Distance_km: Math.round(cum), CID_div_total: members },
        geometry: { type: "LineString", coordinates: seg.map(proj.from) } });
    }
    start = i;
  }
  return out;
}

// ---------------------------------------------------------------- one theatre
export interface Reclustered { dv: FC; geo: FC; info: ClusterInfo; proj: Projection; tracks: Map<string, Track>; avg: { dv: Map<number, Pt[]>; geo: Map<number, Pt[]> } }

/** Order group ids 0..k-1 from north to south by the mean end point of their members. */
function northToSouth(lab: number[], ts: Track[]): number[] {
  const ids = [...new Set(lab)];
  const endY = (c: number) => { const m = ts.filter((_, i) => lab[i] === c); return m.reduce((a, t) => a + t.pts[t.pts.length - 1][1], 0) / m.length; };
  const order = ids.sort((a, b) => endY(b) - endY(a));
  return lab.map((l) => order.indexOf(l));
}

export function recluster(paths: FC, st: ClusterSettings): Reclustered {
  const all = paths.features.flatMap((f) => lines(f.geometry).flat());
  const proj = projection(all.reduce((a, c) => a + c[0], 0) / all.length, all.reduce((a, c) => a + c[1], 0) / all.length);
  const ts = tracks(paths, proj);
  const moved = (t: Track) => dist(t.pts[0], t.pts[t.pts.length - 1]);
  const active = ts.filter((t) => moved(t) >= st.minMoveKm);
  const behind = ts.filter((t) => moved(t) < st.minMoveKm).map((t) => t.key);

  const dense = active.map((t) => resample(t.pts, 120).pts);
  const X = active.map((t, i) => [...t.pts[t.pts.length - 1], ...[0, 1].map((j) => dense[i].reduce((a, p) => a + p[j], 0) / dense[i].length)]);
  const DX = X.map((a) => X.map((b) => Math.sqrt(sq(a, b))));
  const dvK = Math.min(st.dvK, active.length), geoK = Math.min(st.geoK, active.length);
  const dvLab = northToSouth(kmeans(X, dvK), active);
  const r60 = active.map((t) => resample(t.pts, 60).pts);
  const DH = r60.map((a, i) => r60.map((b, j) => (j < i ? 0 : j === i ? 0 : hausdorff(a, b))));
  DH.forEach((r, i) => r.forEach((_, j) => { if (j < i) DH[i][j] = DH[j][i]; }));
  const geoLab = northToSouth(agglomerative(DH, geoK), active);

  const build = (lab: number[], k: number) => {
    const feats: Feature[] = [], avg = new Map<number, Pt[]>();
    for (let c = 0; c < k; c++) {
      const m = active.filter((_, i) => lab[i] === c);
      if (!m.length) continue;
      const a = averagePath(m);
      avg.set(c, a.pts);
      feats.push(...dailySegments(a, c, m.length, proj));
    }
    return { fc: { type: "FeatureCollection", features: feats.map((f, i) => ({ ...f, id: i })) } as FC, avg };
  };
  const dv = build(dvLab, dvK), geo = build(geoLab, geoK);
  const sizes = (lab: number[], k: number) => Array.from({ length: k }, (_, c) => lab.filter((l) => l === c).length);
  const info: ClusterInfo = {
    dv: { k: dvK, sizes: sizes(dvLab, dvK), silhouette: dvK > 1 ? silhouette(DX, dvLab) : 0 },
    geo: { k: geoK, sizes: sizes(geoLab, geoK), silhouette: geoK > 1 ? silhouette(DH, geoLab) : 0 },
    stayedBehind: behind,
    members: { dv: new Map(active.map((t, i) => [t.key, dvLab[i]])), geo: new Map(active.map((t, i) => [t.key, geoLab[i]])) },
  };
  return { dv: dv.fc, geo: geo.fc, info, proj, tracks: new Map(ts.map((t) => [t.key, t])), avg: { dv: dv.avg, geo: geo.avg } };
}

/** Points or paths with their cluster ids replaced (null = stayed behind, so no cluster filter matches it). */
export function relabel(fc: FC, info: ClusterInfo): FC {
  return { ...fc, features: fc.features.map((f) => {
    const k = divKey(f.properties ?? {});
    return { ...f, properties: { ...f.properties, DV_ClusterID: info.members.dv.get(k) ?? null, Geo_ClusterID: info.members.geo.get(k) ?? null } };
  }) };
}
