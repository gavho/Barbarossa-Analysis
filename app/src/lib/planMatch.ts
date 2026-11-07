// Planned AGS lines of advance vs live cluster average paths, ported from analysis/compare_loa.py (common_clip, frechet,
// pair_lines, signed_offsets, containment, verdict, scores). Frontier only.
import type { Feature } from "geojson";
import { PLAN_MATCH, type FC, type PlanPair } from "@/data";
import { dist, length, nearest, resample, type Projection, type Pt } from "./cluster";
import { wrap } from "./vectors";

export const NOISE_KM = 20, NOISE_DEG = 10, MIN_COMMON_KM = 100;
export const DIRECTION_FULL_DEG = 5; // direction score is 100 only within 5° (Sorin, 11-6), stricter than the noise band
export interface PlanResult { pairs: PlanPair[]; unmatched: number[]; lines: FC }

const dense = (l: Pt[]) => resample(l, Math.max(2, Math.floor(length(l) / 2) + 1)).pts; // every ~2 km
const maxX = (l: Pt[]) => Math.max(...l.map((p) => p[0]));

/** Point at distance d along a line. */
function at(line: Pt[], d: number): Pt {
  let run = 0;
  for (let i = 1; i < line.length; i++) {
    const seg = dist(line[i - 1], line[i]);
    if (run + seg >= d) { const t = seg ? (d - run) / seg : 0; return [line[i - 1][0] + t * (line[i][0] - line[i - 1][0]), line[i - 1][1] + t * (line[i][1] - line[i - 1][1])]; }
    run += seg;
  }
  return line[line.length - 1];
}

/** The stretch of a line from where it first reaches xmin to where it first passes xmax. */
export function clipX(line: Pt[], xmin: number, xmax: number): Pt[] | null {
  const P = dense(line);
  const i0 = P.findIndex((p) => p[0] >= xmin);
  if (i0 < 0) return null;
  const j = P.findIndex((p, i) => i >= i0 && p[0] > xmax);
  const seg = P.slice(i0, j < 0 ? P.length : j);
  return seg.length >= 2 && length(seg) > 1 ? seg : null;
}

export function commonClip(a: Pt[], b: Pt[]): [Pt[], Pt[]] | null {
  const xmin = Math.max(a[0][0], b[0][0]), xmax = Math.min(maxX(a), maxX(b));
  if (xmax <= xmin) return null;
  const ca = clipX(a, xmin, xmax), cb = clipX(b, xmin, xmax);
  return ca && cb && Math.min(length(ca), length(cb)) >= MIN_COMMON_KM ? [ca, cb] : null;
}

/** Discrete Fréchet distance (km), respecting direction of travel. */
export function frechet(a: Pt[], b: Pt[], n = 60): number {
  const A = resample(a, n).pts, B = resample(b, n).pts;
  const ca = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const d = dist(A[i], B[j]);
      ca[i][j] = i === 0 && j === 0 ? d : i === 0 ? Math.max(ca[0][j - 1], d) : j === 0 ? Math.max(ca[i - 1][0], d)
        : Math.max(Math.min(ca[i - 1][j], ca[i][j - 1], ca[i - 1][j - 1]), d);
    }
  }
  return ca[n - 1][n - 1];
}

export const bearing = (a: Pt, b: Pt) => ((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI + 360) % 360; // compass, 0 = north

/** Distance along `planned` (km) and signed offset of `realized` from it; positive = left of travel = north. */
export function signedOffsets(planned: Pt[], realized: Pt[], step = 10): [number, number][] {
  const L = length(planned), out: [number, number][] = [];
  for (let d = 0; d < L; d += step) {
    const p = at(planned, d), t1 = at(planned, Math.min(d + 5, L)), t0 = at(planned, Math.max(d - 5, 0));
    const t = [t1[0] - t0[0], t1[1] - t0[1]], q = nearest(realized, p);
    const cross = t[0] * (q[1] - p[1]) - t[1] * (q[0] - p[0]);
    out.push([d, Math.sign(cross || 1) * dist(p, q)]);
  }
  return out;
}

/** Share of `a` (sampled every step km) lying within tol km of `b`. */
export function containment(a: Pt[], b: Pt[], tol: number, step = 10): number {
  const L = length(a), hits: boolean[] = [];
  for (let d = 0; d < L; d += step) { const p = at(a, d); hits.push(dist(p, nearest(b, p)) <= tol); }
  return hits.filter(Boolean).length / Math.max(1, hits.length);
}

/** Least total Fréchet pairing of planned lines to clusters, one each (brute force: at most 8P4 = 1,680 options). */
export function pairLines(planned: Record<string, Pt[]>, clusters: Map<number, Pt[]>): Record<string, number> {
  const names = Object.keys(planned), ids = [...clusters.keys()];
  const cost = names.map((p) => ids.map((c) => { const cc = commonClip(planned[p], clusters.get(c)!); return cc ? frechet(...cc) : 1e4; }));
  const want = Math.min(names.length, ids.length);
  let best: (number | null)[] = [], bestCost = Infinity;
  const go = (i: number, used: Set<number>, pick: (number | null)[], total: number, assigned: number) => {
    if (total >= bestCost) return;
    if (i === names.length) { if (assigned === want) { best = pick.slice(); bestCost = total; } return; }
    if (names.length - i > want - assigned) go(i + 1, used, [...pick, null], total, assigned); // leave this planned line unmatched
    ids.forEach((_, j) => { if (!used.has(j)) go(i + 1, new Set([...used, j]), [...pick, j], total + cost[i][j], assigned + 1); });
  };
  go(0, new Set(), [], 0, 0);
  return Object.fromEntries(names.flatMap((p, i) => (best[i] === null || best[i] === undefined ? [] : [[p, ids[best[i]!]]])));
}

const ramp = (v: number, full: number, zero: number) => Math.round(100 * Math.min(1, Math.max(0, (zero - v) / (zero - full))));
/** Three 0-100 reader scores (100 inside the mapping-error band) and their mean; same as compare_loa.scores(). */
export function scores(bearingDiff: number, meanGap: number, endGap: number) {
  const d = ramp(Math.abs(bearingDiff), DIRECTION_FULL_DEG, 45), route = ramp(meanGap, NOISE_KM, 100), dest = ramp(endGap, NOISE_KM, 150);
  return { score_direction: d, score_route: route, score_destination: dest, score_overall: Math.round((d + route + dest) / 3) };
}

/** Badge and plain sentence; same wording as compare_loa.verdict(). */
export function verdict(name: string, signed: number, gap: number, within50: number, endGap: number, bd: number, agrees: boolean) {
  const badge: PlanPair["badge"] = gap <= NOISE_KM ? "on plan" : gap <= 50 ? "near plan" : "off plan";
  const ran = gap <= NOISE_KM ? `stayed within mapping error of the plan (on average ${Math.round(gap)} km off)`
    : Math.abs(signed) >= 0.6 * gap ? `ran on average ${Math.round(Math.abs(signed))} km ${signed > 0 ? "north" : "south"} of the plan`
    : `wove on average ${Math.round(gap)} km either side of the plan`;
  const heading = Math.abs(bd) <= NOISE_DEG ? "heading the same way" : `heading ${Math.abs(bd)}° further ${bd > 0 ? "south" : "north"}`;
  const who = agrees ? "Most of its divisions belong to that formation." : `Most of ${name}'s own divisions ended up in another group.`;
  return { badge, sentence: `${name}: the matched group ${ran}, inside the 50 km corridor for ${within50}% of the way, ended ${endGap} km from the planned end point, ${heading}. ${who}` };
}

/** Pair each planned line with a live cluster and describe the match, in the shape of plan_match.json. */
export function matchPlans(avg: Map<number, Pt[]>, members: Map<string, number>, proj: Projection): PlanResult {
  const planned = Object.fromEntries(Object.entries(PLAN_MATCH.planned).map(([u, ll]) => [u, ll.map(proj.to)]));
  const pairing = pairLines(planned, avg);
  const order = Object.keys(pairing).sort((a, b) => planned[a].reduce((s, p) => s + p[1], 0) / planned[a].length - planned[b].reduce((s, p) => s + p[1], 0) / planned[b].length);
  const roster = Object.entries(PLAN_MATCH.roster);
  const pairs: PlanPair[] = [], feats: Feature[] = [];
  for (const p of order) {
    const cid = pairing[p], cc = commonClip(planned[p], avg.get(cid)!);
    if (!cc) continue;
    const [a, b] = cc, prof = signedOffsets(a, b);
    const signed = prof.reduce((s, x) => s + x[1], 0) / prof.length, gap = prof.reduce((s, x) => s + Math.abs(x[1]), 0) / prof.length;
    const within50 = Math.round(100 * containment(b, a, 50)), endGap = Math.round(dist(a[a.length - 1], b[b.length - 1]));
    const bd = Math.round(wrap(bearing(b[0], b[b.length - 1]) - bearing(a[0], a[a.length - 1])));
    const mine = roster.filter(([, u]) => u === p).map(([k]) => k);
    const recall = (c: number) => mine.filter((k) => members.get(k) === c).length;
    const best = [...avg.keys()].reduce((x, c) => (recall(c) > recall(x) ? c : x), [...avg.keys()][0]);
    const name = PLAN_MATCH.planned_names[p] ?? p;
    const v = verdict(name, signed, gap, within50, endGap, bd, mine.length > 0 && best === cid);
    pairs.push({ planned: p, name, cluster: cid, divisions: [...members.values()].filter((c) => c === cid).length, ...v,
      mean_offset_km: Math.round(signed * 10) / 10, mean_gap_km: Math.round(gap * 10) / 10, within50_pct: within50, end_gap_km: endGap,
      bearing_diff: bd, membership_agrees: mine.length > 0 && best === cid, frechet_km: Math.round(frechet(a, b)), ...scores(bd, gap, endGap),
      profile: prof.map(([s, o]) => [Math.round(s), Math.round(o)]), planned_line: PLAN_MATCH.planned[p] as [number, number][],
      realized_line: avg.get(cid)!.map(proj.from) });
    for (const [kind, line] of [["planned", PLAN_MATCH.planned[p]], ["realized", avg.get(cid)!.map(proj.from)]] as const) {
      feats.push({ type: "Feature", id: feats.length, properties: { kind, planned: p, name, cluster: cid, badge: v.badge },
        geometry: { type: "LineString", coordinates: line as number[][] } });
    }
  }
  const matched = new Set(Object.values(pairing));
  return { pairs, unmatched: [...avg.keys()].filter((c) => !matched.has(c)), lines: { type: "FeatureCollection", features: feats } };
}
