// Cluster vectors for live clusters, ported from analysis/compare_loa.py (fit_segments) and analysis/export_vectors.py
// (fit, vector_stats, stability, line of operations). Bearings and lengths are spherical rather than ellipsoidal:
// under 1 km / 1 degree apart over a theatre.
import type { Feature } from "geojson";
import type { FC } from "@/data";
import { length, resample, type Projection, type Pt, type Track } from "./cluster";

export const K = 3, MIN_SEG_KM = 60, FIT_TOL_KM = 10, STABLE_DEG = 10, SENSITIVITY = [40, 80];
const RAD = Math.PI / 180, R = 6371.0088;

/** Best k-segment polyline through the line: dynamic program over n resampled points minimizing the summed squared
 * distance to the segments, every vector at least minKm long. Throws when the line is too short; rms is Infinity when
 * no placement of k vectors that long exists. */
export function fitSegments(line: Pt[], k: number, minKm: number, n = 120): { V: Pt[]; rms: number } {
  const P = resample(line, n).pts;
  const mp = Math.max(1, Math.ceil(minKm / (length(line) / (n - 1))));
  if (k * mp > n - 1) throw new Error("line too short for the requested segments");
  const cost = Array.from({ length: n }, () => new Float64Array(n).fill(Infinity));
  for (let i = 0; i < n; i++) {
    for (let j = i + mp; j < n; j++) {
      const a = P[i], ab = [P[j][0] - a[0], P[j][1] - a[1]], L2 = ab[0] ** 2 + ab[1] ** 2;
      if (L2 < minKm ** 2) continue; // the vector itself (not the path along it) must be long enough
      let s = 0;
      for (let q = i; q <= j; q++) {
        const dx = P[q][0] - a[0], dy = P[q][1] - a[1];
        const t = L2 ? Math.min(1, Math.max(0, (dx * ab[0] + dy * ab[1]) / L2)) : 0;
        s += (dx - t * ab[0]) ** 2 + (dy - t * ab[1]) ** 2;
      }
      cost[i][j] = s;
    }
  }
  const dp = Array.from({ length: k + 1 }, () => new Float64Array(n).fill(Infinity));
  const prev = Array.from({ length: k + 1 }, () => new Int32Array(n));
  dp[0][0] = 0;
  for (let s = 1; s <= k; s++) {
    for (let j = 1; j < n; j++) {
      for (let i = 0; i < j; i++) {
        const c = dp[s - 1][i] + cost[i][j];
        if (c < dp[s][j]) { dp[s][j] = c; prev[s][j] = i; }
      }
    }
  }
  const idx = [n - 1];
  for (let s = k, j = n - 1; s > 0; s--) { j = prev[s][j]; idx.push(j); }
  return { V: idx.reverse().map((i) => P[i]), rms: Math.sqrt(dp[k][n - 1] / n) };
}

function tryFit(line: Pt[], k: number, minKm: number) {
  try {
    const r = fitSegments(line, k, minKm);
    return Number.isFinite(r.rms) ? r : null;
  } catch {
    return null;
  }
}

/** Fewest vectors (1..K) whose RMS distance to the path is within FIT_TOL_KM; otherwise the best feasible k. */
export function fit(line: Pt[], minKm = MIN_SEG_KM) {
  if (length(line) < minKm) return fitSegments(line, 1, 0);
  let best: { V: Pt[]; rms: number } | null = null;
  for (let k = 1; k <= K; k++) {
    const r = tryFit(line, k, minKm);
    if (!r) break;
    best = r;
    if (r.rms <= FIT_TOL_KM) break;
  }
  return best ?? fitSegments(line, 1, 0);
}

export const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
/** Initial great-circle azimuth (degrees from true north) and distance (km) between two lon/lat points. */
export function azimuth([lo1, la1]: number[], [lo2, la2]: number[]): number {
  const p1 = la1 * RAD, p2 = la2 * RAD, dl = (lo2 - lo1) * RAD;
  return ((Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / RAD) + 360) % 360;
}
export function greatCircleKm([lo1, la1]: number[], [lo2, la2]: number[]): number {
  const a = Math.sin(((la2 - la1) * RAD) / 2) ** 2 + Math.cos(la1 * RAD) * Math.cos(la2 * RAD) * Math.sin(((lo2 - lo1) * RAD) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Azimuth and length of each vector, and the turn at each inner vertex (+ = clockwise), arrival heading to departure. */
export function vectorStats(ll: number[][]) {
  const az: number[] = [], km: number[] = [], turns: number[] = [];
  let arrive: number | null = null;
  for (let i = 0; i < ll.length - 1; i++) {
    const a12 = azimuth(ll[i], ll[i + 1]);
    if (arrive !== null) turns.push(wrap(a12 - arrive));
    az.push(a12);
    km.push(greatCircleKm(ll[i], ll[i + 1]));
    arrive = (azimuth(ll[i + 1], ll[i]) + 180) % 360;
  }
  return { az, km, turns };
}

/** One FC of vector features per method, with the properties export_vectors.py writes. */
export function clusterVectors(avg: Map<number, Pt[]>, members: Map<string, number>, tracks: Map<string, Track>, proj: Projection, clustering: "DV" | "GEO"): FC {
  const feats: Feature[] = [];
  for (const [cid, line] of [...avg].sort((a, b) => a[0] - b[0])) {
    const { V, rms } = fit(line);
    const ll = V.map(proj.from);
    const { az, km, turns } = vectorStats(ll);
    const checks = az.length > 1 ? SENSITIVITY.map((alt) => tryFit(line, az.length, alt)).filter(Boolean)
      .map((r) => vectorStats(r!.V.map(proj.from)).az.every((a, i) => Math.abs(wrap(a - az[i])) <= STABLE_DEG)) : [];
    const mem = [...members].filter(([, c]) => c === cid).map(([k]) => tracks.get(k)!).filter(Boolean);
    const props: Record<string, unknown> = { Clustering: clustering, Cluster_ID: cid, Vectors: az.length, Members: mem.length,
      Path_km: Math.round(length(line)), Fit_RMS_km: Math.round(rms * 10) / 10, Stable: checks.length ? checks.every(Boolean) : null };
    az.forEach((a, i) => { props[`V${i + 1}_Bearing`] = Math.round(a); props[`V${i + 1}_km`] = Math.round(km[i]); });
    turns.forEach((t, i) => { props[`Turn${i + 1}`] = Math.round(t); });
    if (mem.length) { // the paper's line of operations: mean member start -> mean member end
      const mean = (pick: (t: Track) => Pt): Pt => [0, 1].map((j) => mem.reduce((a, t) => a + pick(t)[j], 0) / mem.length) as Pt;
      const s = proj.from(mean((t) => t.pts[0])), e = proj.from(mean((t) => t.pts[t.pts.length - 1]));
      const loo = greatCircleKm(s, e), meanLen = mem.reduce((a, t) => a + length(t.pts), 0) / mem.length;
      Object.assign(props, { LOO_Bearing: Math.round(azimuth(s, e)), LOO_km: Math.round(loo), Mean_Member_km: Math.round(meanLen),
        Directness: meanLen ? Math.round((100 * loo) / meanLen) / 100 : null });
    }
    feats.push({ type: "Feature", id: feats.length, properties: props, geometry: { type: "LineString", coordinates: ll } });
  }
  return { type: "FeatureCollection", features: feats };
}

