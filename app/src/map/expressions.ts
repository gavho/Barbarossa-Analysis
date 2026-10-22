import type { ExpressionSpecification, FilterSpecification } from "maplibre-gl";
import type { ClusterKind, LayerStyle, Mode, TimeKind } from "@/config/presets";

type Expr = ExpressionSpecification;

export interface Filters {
  geo: number | null;
  dv: number | null;
  /** Click-to-filter from a chart, applied to division points only. */
  chart: { field: string; value: string } | null;
}

export function colorExpr(s: LayerStyle): Expr | string {
  if (s.colorMode === "category" && s.colorField && s.categories?.length) {
    const pairs = s.categories.flatMap((c) => [c.value, c.color]);
    return ["match", ["get", s.colorField], ...pairs, s.color] as unknown as Expr;
  }
  if (s.colorMode === "ramp" && s.colorField && s.ramp?.length) {
    return ["interpolate", ["linear"], ["to-number", ["get", s.colorField], s.ramp[0][0]], ...s.ramp.flat()] as unknown as Expr;
  }
  return s.color;
}

/** Size by field (radius for circles, width for lines); the circle variant also grows with zoom. */
export function sizeExpr(s: LayerStyle, kind: "circle" | "line"): Expr | number {
  const [lo, hi] = s.size;
  const [d0, d1] = s.sizeDomain ?? [0, 1];
  const byField: Expr | number =
    s.sizeField && hi !== lo && d1 > d0
      ? ["interpolate", ["linear"], ["to-number", ["coalesce", ["get", s.sizeField], d0]], d0, lo, d1, hi]
      : lo;
  if (kind === "line") return byField;
  return ["interpolate", ["linear"], ["zoom"], 4, ["*", byField, 0.7], 7, byField, 10, ["*", byField, 2]] as Expr;
}

export function timeFilter(kind: TimeKind, mode: Mode, date: string): Expr | null {
  const d = ["literal", date] as unknown as Expr;
  switch (kind) {
    case "day":
      return mode === "instant" ? ["==", ["get", "Date"], d] : ["<=", ["get", "Date"], d];
    case "exact":
      return ["==", ["get", "Date"], d];
    case "span":
      return mode === "instant"
        ? ["all", ["<=", ["get", "Start_Date"], d], [">=", ["get", "End_Date"], d]]
        : ["<=", ["get", "Start_Date"], d];
    case "start":
      // Instant web maps showed cluster paths unfiltered; Progressive builds them up over time.
      return mode === "instant" ? null : ["<=", ["get", "Start_Date"], d];
    case "none":
      return null;
  }
}

export function clusterFilter(kind: ClusterKind, f: Filters): Expr[] {
  const out: Expr[] = [];
  if (kind === "members") {
    if (f.geo !== null) out.push(["==", ["get", "Geo_ClusterID"], f.geo]);
    if (f.dv !== null) out.push(["==", ["get", "DV_ClusterID"], f.dv]);
  } else if (kind === "geo" && f.geo !== null) out.push(["==", ["get", "Cluster_ID"], f.geo]);
  else if (kind === "dv" && f.dv !== null) out.push(["==", ["get", "Cluster_ID"], f.dv]);
  return out;
}

export function layerFilter(
  time: TimeKind, cluster: ClusterKind, mode: Mode, date: string, f: Filters, isPoints: boolean,
): FilterSpecification | undefined {
  const parts = [timeFilter(time, mode, date), ...clusterFilter(cluster, f)].filter(Boolean) as Expr[];
  if (isPoints && f.chart) parts.push(["==", ["to-string", ["get", f.chart.field]], f.chart.value]);
  if (!parts.length) return undefined;
  return (parts.length === 1 ? parts[0] : ["all", ...parts]) as FilterSpecification;
}

/** The same filter as `layerFilter`, evaluated in JS for charts, tables and exports. */
export function matches(
  p: Record<string, unknown>, time: TimeKind, cluster: ClusterKind, mode: Mode, date: string, f: Filters, isPoints: boolean,
): boolean {
  const s = (k: string) => (p[k] as string | null) ?? "";
  switch (time) {
    case "day":
      if (mode === "instant" ? s("Date") !== date : s("Date") > date) return false;
      break;
    case "exact":
      if (s("Date") !== date) return false;
      break;
    case "span":
      if (s("Start_Date") > date || (mode === "instant" && s("End_Date") < date)) return false;
      break;
    case "start":
      if (mode === "progressive" && s("Start_Date") > date) return false;
      break;
  }
  if (cluster === "members") {
    if (f.geo !== null && p.Geo_ClusterID !== f.geo) return false;
    if (f.dv !== null && p.DV_ClusterID !== f.dv) return false;
  } else if (cluster === "geo" && f.geo !== null && p.Cluster_ID !== f.geo) return false;
  else if (cluster === "dv" && f.dv !== null && p.Cluster_ID !== f.dv) return false;
  if (isPoints && f.chart && String(p[f.chart.field]) !== f.chart.value) return false;
  return true;
}
