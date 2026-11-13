import { PLAN_MATCH, type Dataset, type RegionData } from "@/data";
import type { RegionId } from "@/config/regions";
import type { LineString } from "geojson";
import { PUBLISHED, divKey, dist, projection, recluster, relabel, type ClusterInfo, type ClusterSettings, type Pt } from "@/lib/cluster";
import { clusterVectors } from "@/lib/vectors";
import { matchPlans, type PlanResult } from "@/lib/planMatch";
import type { State } from "./store";
import { plannedOf } from "./lines";

/** A theatre's data as the app should show it: the stored (published) clusters, or live ones from the cluster settings. */
export interface LiveRegion extends RegionData { info?: ClusterInfo; plan?: PlanResult }

const cache = new WeakMap<Dataset, Map<string, LiveRegion>>();
const PROJ = projection(29, 50);
const pubGroups = new WeakMap<RegionData, ReturnType<typeof publishedGroups>>(); // reused while a line is redrawn point by point
/** The published DV groups as plan matching needs them: each average path (its daily segments joined) and its divisions. */
function publishedGroups(base: RegionData) {
  const avg = new Map<number, Pt[]>(), members = new Map<string, number>();
  const segs = [...base.dv.features].sort((a, b) => a.properties!.Cluster_ID - b.properties!.Cluster_ID || a.properties!.Day_Index - b.properties!.Day_Index);
  for (const f of segs) {
    const c = Number(f.properties!.Cluster_ID), line = avg.get(c) ?? avg.set(c, []).get(c)!;
    for (const q of (f.geometry as LineString).coordinates.map(PROJ.to)) if (!line.length || dist(line[line.length - 1], q) > 1e-6) line.push(q);
  }
  for (const f of base.points.features) if (f.properties?.DV_ClusterID != null) members.set(divKey(f.properties), Number(f.properties.DV_ClusterID));
  return { avg, members };
}

export const settingsOf = (s: Pick<State, "clusters">, region: RegionId): ClusterSettings => s.clusters[region] ?? PUBLISHED;

/** Memoized per dataset and settings, so every panel and the map share one computation (well under a second). */
export function regionOf(s: Pick<State, "data" | "clusters" | "lineEdits">, region: RegionId): LiveRegion {
  const st = settingsOf(s, region), base = s.data.regions[region];
  const redrawn = region === "frontier" && Object.values(s.lineEdits.advance).some((c) => c.length >= 2);
  if (st.preset === "published" && !redrawn) return region === "frontier" ? publishedFrontier(base) : base;
  if (!cache.has(s.data)) cache.set(s.data, new Map());
  const memo = cache.get(s.data)!, planned = plannedOf(s.lineEdits);
  const key = `${region}|${st.dvK}|${st.geoK}|${st.minMoveKm}|${redrawn ? JSON.stringify(s.lineEdits.advance) : ""}`;
  if (st.preset === "published") { // published groups, compared live against the redrawn lines of advance
    if (!memo.has(key)) {
      const g = pubGroups.get(base) ?? pubGroups.set(base, publishedGroups(base)).get(base)!;
      memo.set(key, { ...publishedFrontier(base), plan: matchPlans(g.avg, g.members, PROJ, planned) });
    }
    return memo.get(key)!;
  }
  if (!memo.has(key)) {
    const r = recluster(base.paths, st);
    const live: LiveRegion = { ...base, points: relabel(base.points, r.info), paths: relabel(base.paths, r.info), dv: r.dv, geo: r.geo,
      dvvec: clusterVectors(r.avg.dv, r.info.members.dv, r.tracks, r.proj, "DV"),
      geovec: clusterVectors(r.avg.geo, r.info.members.geo, r.tracks, r.proj, "GEO"), info: r.info };
    if (region === "frontier") {
      live.plan = matchPlans(r.avg.dv, r.info.members.dv, r.proj, planned);
      // The Vectors cards show each cluster's planned-line comparison, for both methods as in the published data.
      attachPlan(live.dvvec.features, live.plan);
      attachPlan(live.geovec.features, matchPlans(r.avg.geo, r.info.members.geo, r.proj, planned));
    }
    memo.set(key, live);
  }
  return memo.get(key)!;
}

let published: { base: RegionData; live: LiveRegion } | null = null;
function publishedFrontier(base: RegionData): LiveRegion {
  if (published?.base !== base) published = { base, live: { ...base, plan: PLAN_MATCH.DV } };
  return published.live;
}

function attachPlan(feats: GeoJSON.Feature[], plan: PlanResult) {
  for (const f of feats) {
    const p = plan.pairs.find((x) => x.cluster === f.properties?.Cluster_ID);
    if (p) Object.assign(f.properties!, { Plan_Line: p.planned, Plan_Frechet_km: p.frechet_km, Plan_Offset_km: p.mean_offset_km,
      Plan_AbsOffset_km: p.mean_gap_km, Plan_Within50_pct: p.within50_pct, Plan_Membership_Agrees: p.membership_agrees });
  }
}

/** A readable name for a division key "Nation|Branch|Number". */
export const divisionName = (key: string) => PLAN_MATCH.names[key] ?? key.split("|").reverse().join(" ");
