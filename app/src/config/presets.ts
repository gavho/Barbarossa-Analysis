import type { PageId } from "./regions";

export type Mode = "instant" | "progressive";
export type LayerKind = "circle" | "line" | "fill" | "heatmap";
export type LayerId =
  | "areas" | "ellipses" | "heat" | "geo" | "dv" | "paths" | "points"
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

export const REGION_LAYERS: LayerDef[] = [
  { id: "ellipses", title: "Center of Mass Ellipses", kind: "fill", time: "exact", cluster: "none", fields: ["Date"] },
  { id: "heat", title: "Division Heatmap", kind: "heatmap", time: "day", cluster: "members", fields: ["Frac_Unit"] },
  { id: "geo", title: "Geometric Cluster Paths", kind: "line", time: "start", cluster: "geo", fields: CLUSTER_FIELDS },
  { id: "dv", title: "Directional Vector Cluster Paths", kind: "line", time: "start", cluster: "dv", fields: CLUSTER_FIELDS },
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

export const layersFor = (page: PageId, plan: boolean): LayerDef[] =>
  page === "home" ? HOME_LAYERS : [...REGION_LAYERS, ...(page === "frontier" && plan ? PLAN_LAYERS : [])];

export const BRANCH_COLORS: Category[] = [
  { value: "Armored", color: "#B55454" },
  { value: "Motorized", color: "#4F6F8F" },
  { value: "Mountain", color: "#8A6B4A" },
  { value: "Infantry", color: "#4F7F5C" },
  { value: "Security", color: "#C2A84A" },
  { value: "Cavalry", color: "#7A5C8F" },
];
export const CLUSTER_COLORS: Category[] = [
  { value: 0, color: "#ED5151" },
  { value: 1, color: "#149ECE" },
  { value: 2, color: "#A7C636" },
  { value: 3, color: "#9E559C" },
  { value: 4, color: "#FC921F" },
];
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
    case "plan_pocket":
      return { ...base, visible: true, color: "#1c1c1c", size: [2.5, 2.5], dash: true };
  }
}

/** Styles are stored per page and mode so Instant and Progressive keep their own symbology. */
export const styleKey = (page: PageId, mode: Mode, id: LayerId) => `${page}:${mode}:${id}`;
