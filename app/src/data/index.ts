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
export const MILESTONES = milestones as unknown as Record<"AGS_PhaseLines" | "AGS_AdvanceLines" | "AGS_SmallPocketCOA", FC>;

const fc = (x: unknown) => x as FC;
const days = (x: unknown) => x as DivisionDays[];

export const EMBEDDED: Dataset = {
  source: { kind: "embedded", date: meta.snapshot },
  overview: fc(overview_points),
  areas: fc(areas),
  regions: {
    frontier: { points: fc(frontier_points), paths: fc(frontier_paths), dv: fc(frontier_dv), geo: fc(frontier_geo), ellipses: fc(frontier_ellipses), days: days(frontier_days) },
    leningrad: { points: fc(leningrad_points), paths: fc(leningrad_paths), dv: fc(leningrad_dv), geo: fc(leningrad_geo), ellipses: fc(leningrad_ellipses), days: days(leningrad_days) },
    smolensk: { points: fc(smolensk_points), paths: fc(smolensk_paths), dv: fc(smolensk_dv), geo: fc(smolensk_geo), ellipses: fc(smolensk_ellipses), days: days(smolensk_days) },
    typhoon: { points: fc(typhoon_points), paths: fc(typhoon_paths), dv: fc(typhoon_dv), geo: fc(typhoon_geo), ellipses: fc(typhoon_ellipses), days: days(typhoon_days) },
  },
};
