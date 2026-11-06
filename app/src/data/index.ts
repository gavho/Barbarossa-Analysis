import type { FeatureCollection } from "geojson";
import type { RegionId } from "@/config/regions";
import meta from "./meta.json";
import overview_points from "./overview_points.json";
import areas from "./areas.json";
import countries from "./countries.json";
import milestones from "./milestones.json";
import frontier_points from "./frontier_points.json";
import frontier_paths from "./frontier_paths.json";
import frontier_dv from "./frontier_dv.json";
import frontier_geo from "./frontier_geo.json";
import frontier_ellipses from "./frontier_ellipses.json";
import frontier_days from "./frontier_days.json";
import leningrad_points from "./leningrad_points.json";
import leningrad_paths from "./leningrad_paths.json";
import leningrad_dv from "./leningrad_dv.json";
import leningrad_geo from "./leningrad_geo.json";
import leningrad_ellipses from "./leningrad_ellipses.json";
import leningrad_days from "./leningrad_days.json";
import smolensk_points from "./smolensk_points.json";
import smolensk_paths from "./smolensk_paths.json";
import smolensk_dv from "./smolensk_dv.json";
import smolensk_geo from "./smolensk_geo.json";
import smolensk_ellipses from "./smolensk_ellipses.json";
import smolensk_days from "./smolensk_days.json";
import typhoon_points from "./typhoon_points.json";
import typhoon_paths from "./typhoon_paths.json";
import typhoon_dv from "./typhoon_dv.json";
import typhoon_geo from "./typhoon_geo.json";
import typhoon_ellipses from "./typhoon_ellipses.json";
import typhoon_days from "./typhoon_days.json";
import frontier_vectors from "./frontier_vectors.json";
import leningrad_vectors from "./leningrad_vectors.json";
import smolensk_vectors from "./smolensk_vectors.json";
import typhoon_vectors from "./typhoon_vectors.json";
import phase_clusters from "./phase_clusters.json";
import phase_distributions from "./phase_distributions.json";
import phase_checkpoints from "./phase_checkpoints.json";
import phase_profiles from "./phase_profiles.json";
import plan_match from "./plan_match.json";

export type FC = FeatureCollection;

export interface DivisionDays {
  Division: number;
  Nation: string;
  Branch: string;
  Days_Active: number;
  Move_Days: number;
  Reserve_Days: number;
  Attack_Days: number;
  Defend_Days: number;
}

export interface RegionData {
  points: FC;
  paths: FC;
  dv: FC;
  geo: FC;
  /** Vectorized cluster average paths, computed offline by analysis/export_vectors.py (not refreshed from AGOL). */
  dvvec: FC;
  geovec: FC;
  ellipses: FC;
  days: DivisionDays[];
}

export interface Dataset {
  source: { kind: "embedded" | "agol"; date: string };
  overview: FC;
  areas: FC;
  regions: Record<RegionId, RegionData>;
}

/** Static layers that never come from AGOL refresh. */
export const COUNTRIES = countries as unknown as FC;
export interface PhaseSplit {
  method: "DV" | "GEO"; from_stretch: string; from_cluster: number; group_went_to: number; division_went_to: number;
  division: string; group_size: number;
}
/** Clusters per stretch between AGS phase lines (analysis/phase_clusters.py); splits are those both methods find. */
export const PHASES = phase_clusters as unknown as { stretches: string[]; average_paths: FC; pieces: FC; splits: PhaseSplit[] };
/** How the divisions' spread along the front changed past each phase line (analysis/phase_distributions.py). */
export const PHASE_SHIFTS = phase_distributions as {
  from: string; to: string; sentence: string; shift_km: number; hist_r: number; order_rho: number; wasserstein_km: number;
  ks_D: number; ks_p: number;
}[];
export interface CheckGroup { line: string; group: number; divisions: number; sector: string; first: string; median: string; last: string;
  lonlat: [number, number]; members: string }
export interface CheckFlow { from_line: string; from_group: number; to_line: string; to_group: number | null; divisions: number;
  major: boolean; members: string }
/** Phase lines as checkpoints: who crossed each line together, where and when (analysis/phase_checkpoints.py). */
export const PHASE_CHECKS = phase_checkpoints as unknown as {
  lines: string[]; info: Record<string, { k: number; silhouette: number }>; groups: CheckGroup[]; flows: CheckFlow[];
  splits: { from_line: string; to_line: string; division: string; from_group: number; division_went_to: number }[];
  ribbons: FC; crossings: FC;
};
/** Where along the front (north-south km) the divisions were per stretch, with Jenks natural breaks (phase_distributions.py). */
export const PHASE_PROFILES = phase_profiles as unknown as {
  bin_km: number; bins_from_km: number; towns: { name: string; km: number }[];
  profiles: { stretch: string; share: number[]; mean_km: number; breaks: number[]; gvf: number;
    bands: { band: string; share: number; divisions: number; from: number; to: number; unit: "%" | "km" }[] }[];
  positions: { division: string; stretch: string; km: number }[];
  zones: FC;
};
export interface PlanPair { planned: string; name: string; cluster: number; divisions: number; badge: "on plan" | "near plan" | "off plan";
  sentence: string; mean_offset_km: number; mean_gap_km: number; within50_pct: number; end_gap_km: number; bearing_diff: number;
  membership_agrees: boolean; profile: [number, number][]; planned_line: [number, number][]; realized_line: [number, number][];
  frechet_km?: number; score_direction: number; score_route: number; score_destination: number; score_overall: number }
export type PlanClustering = "DV" | "DV4";
/** Planned AGS lines of advance vs the matched realized groups, published 5 clusters (DV) or 4 groups of advancing
 * divisions (DV4), from analysis/compare_loa.py. */
export const PLAN_MATCH = plan_match as unknown as Record<PlanClustering, { pairs: PlanPair[]; unmatched: number[]; lines: FC }> & {
  stayed_behind: string[]; towns: Record<string, [number, number]>;
  planned: Record<string, [number, number][]>; planned_names: Record<string, string>;
  roster: Record<string, string>; names: Record<string, string>; // division key "Nation|Branch|Number" -> planned unit / name
};
export const MILESTONES = milestones as unknown as Record<"AGS_PhaseLines" | "AGS_AdvanceLines" | "AGS_SmallPocketCOA", FC>;

const fc = (x: unknown) => x as FC;
const days = (x: unknown) => x as DivisionDays[];
const vec = (x: unknown) => ({ dvvec: (x as { dv: FC }).dv, geovec: (x as { geo: FC }).geo });

export const EMBEDDED: Dataset = {
  source: { kind: "embedded", date: meta.snapshot },
  overview: fc(overview_points),
  areas: fc(areas),
  regions: {
    frontier: { points: fc(frontier_points), paths: fc(frontier_paths), dv: fc(frontier_dv), geo: fc(frontier_geo), ellipses: fc(frontier_ellipses), days: days(frontier_days), ...vec(frontier_vectors) },
    leningrad: { points: fc(leningrad_points), paths: fc(leningrad_paths), dv: fc(leningrad_dv), geo: fc(leningrad_geo), ellipses: fc(leningrad_ellipses), days: days(leningrad_days), ...vec(leningrad_vectors) },
    smolensk: { points: fc(smolensk_points), paths: fc(smolensk_paths), dv: fc(smolensk_dv), geo: fc(smolensk_geo), ellipses: fc(smolensk_ellipses), days: days(smolensk_days), ...vec(smolensk_vectors) },
    typhoon: { points: fc(typhoon_points), paths: fc(typhoon_paths), dv: fc(typhoon_dv), geo: fc(typhoon_geo), ellipses: fc(typhoon_ellipses), days: days(typhoon_days), ...vec(typhoon_vectors) },
  },
};
