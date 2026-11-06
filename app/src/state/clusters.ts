import { PLAN_MATCH, type Dataset, type RegionData } from "@/data";
import type { RegionId } from "@/config/regions";
import { PUBLISHED, recluster, relabel, type ClusterInfo, type ClusterSettings } from "@/lib/cluster";
import { clusterVectors } from "@/lib/vectors";
import { matchPlans, type PlanResult } from "@/lib/planMatch";
import type { State } from "./store";

/** A theatre's data as the app should show it: the stored (published) clusters, or live ones from the cluster settings. */
export interface LiveRegion extends RegionData { info?: ClusterInfo; plan?: PlanResult }

const cache = new WeakMap<Dataset, Map<string, LiveRegion>>();

export const settingsOf = (s: Pick<State, "clusters">, region: RegionId): ClusterSettings => s.clusters[region] ?? PUBLISHED;

/** Memoized per dataset and settings, so every panel and the map share one computation (well under a second). */
export function regionOf(s: Pick<State, "data" | "clusters">, region: RegionId): LiveRegion {
  const st = settingsOf(s, region), base = s.data.regions[region];
  if (st.preset === "published") return region === "frontier" ? publishedFrontier(base) : base;
  if (!cache.has(s.data)) cache.set(s.data, new Map());
  const memo = cache.get(s.data)!, key = `${region}|${st.dvK}|${st.geoK}|${st.minMoveKm}`;
  if (!memo.has(key)) {
    const r = recluster(base.paths, st);
    const live: LiveRegion = { ...base, points: relabel(base.points, r.info), paths: relabel(base.paths, r.info), dv: r.dv, geo: r.geo,
      dvvec: clusterVectors(r.avg.dv, r.info.members.dv, r.tracks, r.proj, "DV"),
      geovec: clusterVectors(r.avg.geo, r.info.members.geo, r.tracks, r.proj, "GEO"), info: r.info };
    if (region === "frontier") {
      live.plan = matchPlans(r.avg.dv, r.info.members.dv, r.proj);
      // The Vectors cards show each cluster's planned-line comparison, for both methods as in the published data.
      attachPlan(live.dvvec.features, live.plan);
      attachPlan(live.geovec.features, matchPlans(r.avg.geo, r.info.members.geo, r.proj));
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
