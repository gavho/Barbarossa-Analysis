import type { PageId } from "./regions";

export type Mode = "instant" | "progressive";
export type LayerKind = "circle" | "line" | "fill" | "heatmap";
export type LayerId =
  | "areas" | "ellipses" | "heat" | "geo" | "dv" | "geovec" | "dvvec" | "phaseavg" | "phasepieces" | "checklines" | "checkpaths" | "checkdots" | "spreadsurface" | "spreadgroups" | "breakdots" | "jenksdots" | "jenkslines" | "matchplan" | "matchreal" | "paths" | "points"
  | "plan_phase" | "plan_advance" | "plan_pocket";

/** How the timeline filters a layer: by mode (day), always one day (exact), a start..end span, started-by, or not at all. */
export type TimeKind = "day" | "exact" | "span" | "start" | "none";
/** Which cluster filter field a layer answers to. */
export type ClusterKind = "members" | "geo" | "dv" | "none";

export interface LayerDef {
  id: LayerId;
  title: string;
  kind: LayerKind;
  time: TimeKind;
  cluster: ClusterKind;
  /** Fields offered in the style editor and the attribute table, in display order. */
  fields: string[];
}

export interface Category { value: string | number; color: string }

export interface LayerStyle {
  visible: boolean;
  opacity: number;
  colorMode: "single" | "category" | "ramp";
  color: string;
  colorField?: string;
  categories?: Category[];
  ramp?: [number, string][];
  sizeField?: string;
  sizeDomain?: [number, number];
  size: [number, number];
  outline?: string;
  labels?: boolean;
  dash?: boolean;
  heatRadius?: number;
}

const CLUSTER_FIELDS = ["Cluster_ID", "Day_Index", "Date", "Start_Date", "End_Date", "Speed_km_day", "Cumulative_Distance_km", "CID_div_total"];

const VEC_FIELDS = ["Cluster_ID", "Members", "Vectors", "V1_Bearing", "V1_km", "V2_Bearing", "V2_km", "V3_Bearing", "V3_km", "Turn1", "Turn2",
  "Fit_RMS_km", "Stable", "LOO_Bearing", "LOO_km", "Directness"];

export const REGION_LAYERS: LayerDef[] = [
  { id: "ellipses", title: "Center of Mass Ellipses", kind: "fill", time: "exact", cluster: "none", fields: ["Date"] },
  { id: "heat", title: "Division Heatmap", kind: "heatmap", time: "day", cluster: "members", fields: ["Frac_Unit"] },
  { id: "geo", title: "Geometric Cluster Paths", kind: "line", time: "start", cluster: "geo", fields: CLUSTER_FIELDS },
  { id: "dv", title: "Directional Vector Cluster Paths", kind: "line", time: "start", cluster: "dv", fields: CLUSTER_FIELDS },
  { id: "geovec", title: "Geometric Cluster Vectors", kind: "line", time: "none", cluster: "geo", fields: VEC_FIELDS },
  { id: "dvvec", title: "Directional Vector Cluster Vectors", kind: "line", time: "none", cluster: "dv", fields: VEC_FIELDS },
  { id: "paths", title: "Division Paths", kind: "line", time: "span", cluster: "members",
    fields: ["Num_Name", "Branch", "Nation", "Start_Date", "End_Date", "Duration_Days", "Distance_KM", "Avg_Speed_KM_Day", "Geo_ClusterID", "DV_ClusterID"] },
  { id: "points", title: "Division Locations", kind: "circle", time: "day", cluster: "members",
    fields: ["Date", "Num_Name", "Branch_Type", "Unit_Type", "Posture", "Frac_Unit", "Nation", "Geo_ClusterID", "DV_ClusterID"] },
];

export const HOME_LAYERS: LayerDef[] = [
  { id: "areas", title: "Areas of Interest", kind: "line", time: "none", cluster: "none", fields: ["Region"] },
  { id: "heat", title: "Barbarossa Heatmap", kind: "heatmap", time: "day", cluster: "none", fields: ["Frac_Unit"] },
];

export const PLAN_LAYERS: LayerDef[] = [
  { id: "plan_pocket", title: "Plan · Small-pocket COA", kind: "line", time: "none", cluster: "none", fields: ["unit", "notes"] },
  { id: "plan_advance", title: "Plan · Lines of Advance", kind: "line", time: "none", cluster: "none", fields: ["unit", "color", "notes"] },
  { id: "plan_phase", title: "Plan · Phase Lines", kind: "line", time: "none", cluster: "none",
    fields: ["line_id", "name", "towns", "planned_date", "date_start", "date_end", "units", "notes"] },
];

export const PHASE_LAYERS: LayerDef[] = [
  { id: "phasepieces", title: "Phase · Division Pieces", kind: "line", time: "none", cluster: "none", fields: ["division", "nation", "stretch", "km", "cluster"] },
  { id: "phaseavg", title: "Phase · Group Paths", kind: "line", time: "none", cluster: "none",
    fields: ["method", "stretch", "cluster", "divisions", "silhouette", "bearing", "loo_km", "directness"] },
  { id: "matchplan", title: "Plan vs Actual · Planned Lines", kind: "line", time: "none", cluster: "none", fields: ["name", "badge"] },
  { id: "matchreal", title: "Plan vs Actual · Matched Groups", kind: "line", time: "none", cluster: "none", fields: ["name", "cluster", "badge"] },
  { id: "checklines", title: "Checkpoint · Phase Lines", kind: "line", time: "none", cluster: "none", fields: ["line_id", "name", "planned_date"] },
  { id: "checkpaths", title: "Checkpoint · Group Paths", kind: "line", time: "none", cluster: "none", fields: ["group", "from_line", "to_line", "divisions"] },
  { id: "checkdots", title: "Checkpoint · Crossings", kind: "circle", time: "none", cluster: "none", fields: ["division", "line", "date", "group"] },
  { id: "spreadsurface", title: "Local Groups · Density", kind: "fill", time: "none", cluster: "none", fields: ["date", "level"] },
  { id: "spreadgroups", title: "Local Groups · Outlines", kind: "fill", time: "none", cluster: "none", fields: ["date", "group", "divisions", "dominant"] },
  { id: "jenksdots", title: "Natural Breaks · Divisions", kind: "circle", time: "none", cluster: "none", fields: ["division", "phase", "date", "bin", "class", "km"] },
  { id: "jenkslines", title: "Natural Breaks · Break Lines", kind: "line", time: "none", cluster: "none", fields: ["phase", "km"] },
  { id: "breakdots", title: "Local Groups · Divisions", kind: "circle", time: "none", cluster: "none",
    fields: ["division", "phase", "date", "group", "km", "formation"] },
];

/** Which tab of the left bar a layer is listed under. */
export type LayerGroup = "units" | "clusters" | "phases" | "plan";
export const groupOf = (id: string): LayerGroup =>
  id === "dv" || id === "geo" || id.endsWith("vec") ? "clusters"
    : id.startsWith("plan_") || id.startsWith("match") ? "plan"
    : id.startsWith("phase") || id.startsWith("check") || id.startsWith("spread") || id.startsWith("jenks") || id === "breakdots" ? "phases" : "units";

export const layersFor = (page: PageId, plan: boolean): LayerDef[] =>
  page === "home" ? HOME_LAYERS
    : [...REGION_LAYERS, ...(page === "frontier" ? PHASE_LAYERS : []), ...(page === "frontier" && plan ? PLAN_LAYERS : [])];

export const BRANCH_COLORS: Category[] = [
  { value: "Armored", color: "#B55454" },
  { value: "Motorized", color: "#4F6F8F" },
  { value: "Mountain", color: "#8A6B4A" },
  { value: "Infantry", color: "#4F7F5C" },
  { value: "Security", color: "#C2A84A" },
  { value: "Cavalry", color: "#7A5C8F" },
];
/** Natural-break groups read against the phase line: all past it, on both sides, none past it. */
export const BREAK_COLORS: Category[] = [
  { value: "past", color: "#46a758" }, { value: "straddling", color: "#e0b52b" }, { value: "behind", color: "#8b9099" },
];

/** The four planned lines of operation (greater units) for the phase flow chart; other divisions are grey. */
export const FORMATION_COLORS: Record<string, string> = { "6A": "#149ECE", "III PzKo": "#ED5151", "PzGp1(-)": "#FC921F", "17A": "#A7C636" };

export const CLUSTER_COLORS: Category[] = [
  { value: 0, color: "#ED5151" },
  { value: 1, color: "#149ECE" },
  { value: 2, color: "#A7C636" },
  { value: 3, color: "#9E559C" },
  { value: 4, color: "#FC921F" },
  { value: 5, color: "#F2D649" }, // 5-7 only appear with live cluster settings above 5 groups
  { value: 6, color: "#2EC4B6" },
  { value: 7, color: "#E7298A" },
];
/** Gap-based groups on a phase's planned date, numbered from the front; 0 = a lone division (no neighbour within the gap). */
export const GROUP_COLORS: Category[] = [{ value: 0, color: "#8b9099" }, ...CLUSTER_COLORS.map((c) => ({ value: Number(c.value) + 1, color: c.color }))];
export const POSTURE_COLORS: Record<string, string> = {
  Move: "#5E8FD0",
  Reserve: "#77B484",
  Attack: "#DF6B35",
  Defend: "#DBCF4E",
};
export const SPEED_RAMP: [number, string][] = [
  [45, "#D7191C"], [61, "#FDAE61"], [77, "#FFFFBF"], [94, "#A6D96A"], [110, "#1A9641"],
];
export const HEAT_RAMP: [number, string][] = [
  [0, "rgba(0,34,200,0)"], [0.1, "#0022c8"], [0.3, "#2b1ca7"], [0.5, "#7a1fa2"], [0.7, "#d1205f"], [0.85, "#ff7a00"], [1, "#ffef3a"],
];
const ADVANCE_COLORS: Category[] = [
  { value: "purple", color: "#8e44ad" },
  { value: "blue", color: "#2e86de" },
  { value: "orange", color: "#e67e22" },
  { value: "black", color: "#1c1c1c" },
];
const AREA_COLORS: Category[] = [
  { value: "Frontier", color: "#ff3b30" },
  { value: "Leningrad", color: "#0099ff" },
  { value: "Smolensk", color: "#9aa0a6" },
  { value: "Typhoon", color: "#e600ff" },
];

const base: LayerStyle = { visible: false, opacity: 1, colorMode: "single", color: "#9aa3ad", size: [1.5, 1.5] };

/** Presets ported from the Experience web maps (Instant vs Progressive differ for cluster paths). */
export function preset(page: PageId, mode: Mode, id: LayerId): LayerStyle {
  const progressive = mode === "progressive";
  switch (id) {
    case "areas":
      return { ...base, visible: true, colorMode: "category", colorField: "Region", categories: AREA_COLORS, size: [2, 2], dash: true };
    case "heat":
      return { ...base, visible: page === "home", opacity: 0.85, sizeField: "Frac_Unit", heatRadius: page === "home" ? 18 : 30, size: [1, 1] };
    case "ellipses":
      return { ...base, opacity: 0.18, color: "#c9ced6", outline: "#6e6e6e" };
    case "points":
      return { ...base, visible: true, colorMode: "category", colorField: "Branch_Type", categories: BRANCH_COLORS,
        color: "#8a8a8a", sizeField: "Frac_Unit", sizeDomain: [0.1, 1], size: [2.5, 7], outline: "rgba(153,153,153,0.35)" };
    case "paths":
      return { ...base, colorMode: "category", colorField: "Branch", categories: BRANCH_COLORS, color: "#8a8a8a", size: [1.5, 1.5] };
    case "geo":
    case "dv":
      return progressive
        ? { ...base, visible: id === "dv", colorMode: "ramp", colorField: "Speed_km_day", ramp: SPEED_RAMP,
            sizeField: "CID_div_total", sizeDomain: [1, 42], size: [1.5, 7], labels: id === "dv" }
        : { ...base, colorMode: "category", colorField: "Cluster_ID", categories: CLUSTER_COLORS,
            sizeField: "CID_div_total", sizeDomain: [1, 42], size: [1.5, 7], labels: id === "dv" };
    case "plan_phase":
      return { ...base, visible: true, color: "#00c2a8", size: [2.5, 2.5], labels: true }; // teal: distinct from every unit color
    case "plan_advance":
      return { ...base, visible: true, colorMode: "category", colorField: "color", categories: ADVANCE_COLORS, size: [3.5, 3.5] };
    case "geovec":
    case "dvvec":
      return { ...base, colorMode: "category", colorField: "Cluster_ID", categories: CLUSTER_COLORS, size: [3.4, 3.4], labels: true };
    case "phaseavg":
      return { ...base, colorMode: "category", colorField: "cluster", categories: CLUSTER_COLORS, size: [3.4, 3.4], labels: true };
    case "phasepieces":
      return { ...base, opacity: 0.55, colorMode: "category", colorField: "cluster", categories: CLUSTER_COLORS, size: [1.2, 1.2] };
    case "matchplan":
      return { ...base, color: "#e6e6e6", size: [2.6, 2.6], dash: true };
    case "matchreal":
      return { ...base, colorMode: "category", colorField: "cluster", categories: CLUSTER_COLORS, size: [3.6, 3.6], labels: true };
    case "checklines":
      return { ...base, color: "#00c2a8", size: [2, 2], labels: true, dash: true };
    case "checkpaths":
      return { ...base, colorMode: "category", colorField: "group", categories: CLUSTER_COLORS, size: [4, 4], labels: true };
    case "checkdots":
      return { ...base, colorMode: "category", colorField: "group", categories: CLUSTER_COLORS, size: [4.5, 4.5], outline: "rgba(0,0,0,0.6)" };
    case "breakdots":
      return { ...base, colorMode: "category", colorField: "colour", categories: GROUP_COLORS, size: [5.5, 5.5], outline: "rgba(0,0,0,0.7)" };
    case "jenksdots":
      return { ...base, colorMode: "category", colorField: "bin", categories: GROUP_COLORS, size: [5.5, 5.5], outline: "rgba(0,0,0,0.7)" };
    case "jenkslines":
      return { ...base, color: "#e4e6e9", size: [1.6, 1.6], dash: true };
    case "spreadsurface":
      return { ...base, opacity: 0.45, colorMode: "ramp", colorField: "level", ramp: [[0.35, "#5d6f88"], [1, "#9aae5a"], [2, "#e0b52b"], [4, "#ffe27a"]],
        outline: "rgba(0,0,0,0)" };
    case "spreadgroups":
      return { ...base, opacity: 0.1, colorMode: "category", colorField: "colour", categories: GROUP_COLORS, labels: true };
    case "plan_pocket":
      return { ...base, visible: true, color: "#1c1c1c", size: [2.5, 2.5], dash: true };
  }
}

/** Styles are stored per page and mode so Instant and Progressive keep their own symbology. */
export const styleKey = (page: PageId, mode: Mode, id: LayerId) => `${page}:${mode}:${id}`;
