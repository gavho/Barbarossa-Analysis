import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import type { Feature } from "geojson";
import { EMBEDDED, type Dataset, type DivisionDays, type FC, type RegionData } from "@/data";
import type { RegionId } from "@/config/regions";
import { get, set, toast } from "@/state/store";

// Same public group and layer mapping as agol/download_agol.py and app/scripts/export_data.py.
const PORTAL = "https://purdueuniversity.maps.arcgis.com/sharing/rest";
const GROUP = "3c03d7fd9e3c4384bd282062b2430906";
const NATION_SHORT: Record<number, string> = { 1: "Wehrmacht", 2: "SS", 3: "Hungarian", 4: "Slovak", 5: "Finnish", 6: "Italian", 7: "Romanian" };
type ServiceKey = Exclude<keyof RegionData, "dvvec" | "geovec">; // vectors are derived offline, not downloaded
const REGION_SERVICES: Record<RegionId, Record<ServiceKey, string>> = {
  frontier: { points: "Frontier_Points", paths: "Frontier_Paths", ellipses: "Frontier_Ellipses", dv: "DirectionalVector_Cluster_Avg_Paths", geo: "Geometric_Cluster_avg_paths", days: "frontier_division_days" },
  leningrad: { points: "Leningrad_Points", paths: "Leningrad_Paths", ellipses: "Leningrad_Ellipses", dv: "Leningrad_DV_Cluster_Avg_Paths", geo: "Leningrad_Geo_Cluster_Avg_Paths", days: "leningrad_division_days" },
  smolensk: { points: "Smolensk_Points", paths: "Smolensk_Paths", ellipses: "Smolensk_Ellipses", dv: "Smolensk_DV_Cluster_Avg_Paths", geo: "Smolensk_Geo_Cluster_Avg_Paths", days: "smolensk_division_days" },
  typhoon: { points: "Operation_Typhoon_Points", paths: "Typhoon_Paths", ellipses: "Typhoon_Ellipses", dv: "Typhoon_DV_Avg_Cluster_Paths", geo: "Typhoon_Geo_Cluster_Avg_Paths", days: "typhoon_division_days" },
};
const CACHE = "barbarossa-agol-data";

async function json(url: string, params: Record<string, string | number> = {}) {
  const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), f: params.f ? String(params.f) : "json" });
  const r = await fetch(`${url}?${q}`);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const d = await r.json();
  if (d.error) throw new Error(`${url}: ${d.error.message ?? JSON.stringify(d.error)}`);
  return d;
}

/** Page through a layer by resultOffset; the service caps each response at maxRecordCount. */
export async function fetchAll(layerUrl: string, geometry: boolean, fetcher = json): Promise<{ rows: Record<string, unknown>[]; feats: Feature[]; expected: number }> {
  const info = await fetcher(layerUrl);
  const pageSize = info.maxRecordCount || 1000;
  // returnCountOnly answers 0 for some hosted tables when called from a browser; the id list is reliable.
  const expected = ((await fetcher(`${layerUrl}/query`, { where: "1=1", returnIdsOnly: "true" })).objectIds ?? []).length as number;
  const rows: Record<string, unknown>[] = [], feats: Feature[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const params = { where: "1=1", outFields: "*", orderByFields: info.objectIdField || "OBJECTID", resultOffset: offset, resultRecordCount: pageSize };
    if (geometry) {
      const page = await fetcher(`${layerUrl}/query`, { ...params, outSR: 4326, f: "geojson" });
      feats.push(...page.features);
      if (page.features.length < pageSize) break;
    } else {
      const page = await fetcher(`${layerUrl}/query`, params);
      rows.push(...page.features.map((f: { attributes: Record<string, unknown> }) => f.attributes));
      if (page.features.length < pageSize) break;
    }
  }
  const got = geometry ? feats.length : rows.length;
  if (got !== expected) throw new Error(`${layerUrl}: downloaded ${got} of ${expected} records`);
  return { rows, feats, expected };
}

const day = (v: unknown) => (typeof v === "number" ? new Date(v).toISOString().slice(0, 10) : (v as string | null) ?? null);
const DATE_FIELDS = ["Date", "Start_Date", "End_Date"];

function normalize(feats: Feature[], keep: string[], decode: Record<string, Record<number, string>> = {}): FC {
  return {
    type: "FeatureCollection",
    features: feats.filter((f) => f.geometry).map((f, i) => {
      const p = f.properties ?? {};
      const props: Record<string, unknown> = {};
      for (const k of keep) {
        let v = p[k] ?? null;
        if (DATE_FIELDS.includes(k)) v = day(v);
        else if (decode[k] && v !== null) v = decode[k][v as number] ?? `Code ${v}`;
        props[k] = v;
      }
      return { type: "Feature", id: i, properties: props, geometry: f.geometry };
    }),
  };
}

const POINT_FIELDS = ["Date", "Num_Name", "Branch_Type", "Unit_Type", "Posture", "Frac_Unit", "Nation", "Geo_ClusterID", "DV_ClusterID"];
const PATH_FIELDS = ["Num_Name", "Branch", "Nation", "Start_Date", "End_Date", "Duration_Days", "Distance_KM", "Avg_Speed_KM_Day", "Geo_ClusterID", "DV_ClusterID"];
const CLUSTER_FIELDS = ["Cluster_ID", "Day_Index", "Date", "Start_Date", "End_Date", "Speed_km_day", "Cumulative_Distance_km", "CID_div_total"];

/** Download every layer from the public group and swap it in for this session (and cache it). */
export async function refreshFromAgol(progress: (msg: string) => void): Promise<void> {
  const search = await json(`${PORTAL}/search`, { q: `group:${GROUP}`, num: 100 });
  const urls = new Map<string, string>();
  for (const item of search.results) if (item.type === "Feature Service" && item.url) urls.set(item.url.split("/services/")[1].split("/")[0], `${item.url}/0`);
  const need = (name: string) => { const u = urls.get(name); if (!u) throw new Error(`Service ${name} is missing from the group`); return u; };

  const domain = async (name: string) => {
    // Service names are inconsistent: Branch_Type_domains vs domain_Unit_Type, domain_Posture.
    const { rows } = await fetchAll(need(name === "Branch_Type" ? "Branch_Type_domains" : `domain_${name}`), false);
    return Object.fromEntries(rows.map((r) => [r.Code as number, r.Label as string]));
  };
  progress("Reading coded-value domains");
  const [Branch_Type, Unit_Type, Posture] = await Promise.all([domain("Branch_Type"), domain("Unit_Type"), domain("Posture")]);
  const decode = { Branch_Type, Unit_Type, Posture, Nation: NATION_SHORT };

  const regions = {} as Record<RegionId, RegionData>;
  for (const [region, L] of Object.entries(REGION_SERVICES) as [RegionId, Record<ServiceKey, string>][]) {
    progress(`Downloading ${region}`);
    const [pts, paths, dv, geo, ell, days] = await Promise.all([
      fetchAll(need(L.points), true), fetchAll(need(L.paths), true), fetchAll(need(L.dv), true),
      fetchAll(need(L.geo), true), fetchAll(need(L.ellipses), true), fetchAll(need(L.days), false),
    ]);
    regions[region] = {
      points: normalize(pts.feats, POINT_FIELDS, decode),
      paths: normalize(paths.feats, PATH_FIELDS),
      dv: normalize(dv.feats, CLUSTER_FIELDS),
      geo: normalize(geo.feats, CLUSTER_FIELDS),
      ellipses: normalize(ell.feats, ["Date"]),
      // Vectors are derived offline from the snapshot; keep the embedded ones.
      dvvec: EMBEDDED.regions[region].dvvec,
      geovec: EMBEDDED.regions[region].geovec,
      days: days.rows.map(({ Division, Nation, Branch, Days_Active, Move_Days, Reserve_Days, Attack_Days, Defend_Days }) =>
        ({ Division, Nation, Branch, Days_Active, Move_Days, Reserve_Days, Attack_Days, Defend_Days }) as unknown as DivisionDays),
    };
  }
  progress("Downloading overview");
  const overview = await fetchAll(need("Barbarossa_Points"), true);
  const areas = await fetchAll(need("Areas_of_Interest"), true);
  const data: Dataset = {
    source: { kind: "agol", date: new Date().toISOString().slice(0, 10) },
    overview: normalize(overview.feats, ["Date", "Frac_Unit"]),
    areas: normalize(areas.feats, ["Region"]),
    regions,
  };
  set({ data });
  await idbSet(CACHE, data).catch(() => toast("Refreshed data could not be cached; it will be used for this session only.", "info"));
}

/** On startup, prefer a previously refreshed dataset if one is cached. */
export async function loadCachedRefresh() {
  const data = (await idbGet(CACHE).catch(() => null)) as Dataset | null;
  if (!data?.regions) return;
  set({ data });
  toast(`Using ArcGIS Online data refreshed ${data.source.date}.`, "info", { label: "Use embedded", run: revertToEmbedded });
}

export async function revertToEmbedded() {
  await idbDel(CACHE).catch(() => {});
  set({ data: EMBEDDED });
  toast(`Back to the embedded snapshot (${EMBEDDED.source.date}).`, "ok");
}

export const dataLabel = () => {
  const s = get().data.source;
  return `${s.kind === "agol" ? "AGOL" : "Snapshot"} ${s.date}`;
};
