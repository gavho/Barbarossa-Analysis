import { describe, expect, it, vi } from "vitest";
import type { Feature } from "geojson";
import { layerFilter, matches, timeFilter } from "@/map/expressions";
import { crossings } from "@/lib/crossing";
import { addDays, daysBetween } from "@/lib/dates";
import { csvToPoints, parseCsv } from "@/io/dropLoad";
import { toCsv } from "@/io/export";

vi.mock("@/map/MapView", () => ({ mapRef: null }));
vi.mock("idb-keyval", () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }));

const noFilters = { geo: null, dv: null, chart: null };
const pt = (x: number, y: number, props: Record<string, unknown>): Feature => ({ type: "Feature", properties: props, geometry: { type: "Point", coordinates: [x, y] } });

describe("time filtering", () => {
  it("Instant shows one day, Progressive shows everything up to it", () => {
    const p = { Date: "1941-07-01" };
    expect(matches(p, "day", "none", "instant", "1941-07-01", noFilters, true)).toBe(true);
    expect(matches(p, "day", "none", "instant", "1941-07-02", noFilters, true)).toBe(false);
    expect(matches(p, "day", "none", "progressive", "1941-07-02", noFilters, true)).toBe(true);
    expect(matches(p, "day", "none", "progressive", "1941-06-30", noFilters, true)).toBe(false);
  });
  it("division paths: Instant needs the date inside start..end", () => {
    const p = { Start_Date: "1941-07-01", End_Date: "1941-07-05" };
    expect(matches(p, "span", "members", "instant", "1941-07-03", noFilters, false)).toBe(true);
    expect(matches(p, "span", "members", "instant", "1941-07-06", noFilters, false)).toBe(false);
    expect(matches(p, "span", "members", "progressive", "1941-07-06", noFilters, false)).toBe(true);
  });
  it("cluster paths ignore time in Instant mode (as the web maps did)", () => {
    expect(timeFilter("start", "instant", "1941-07-01")).toBeNull();
    expect(matches({ Start_Date: "1941-09-01" }, "start", "geo", "instant", "1941-07-01", noFilters, false)).toBe(true);
  });
  it("cluster and chart filters combine with time in both JS and MapLibre forms", () => {
    const f = { geo: 2, dv: null, chart: { field: "Posture", value: "Attack" } };
    const p = { Date: "1941-07-01", Geo_ClusterID: 2, Posture: "Attack" };
    expect(matches(p, "day", "members", "instant", "1941-07-01", f, true)).toBe(true);
    expect(matches({ ...p, Geo_ClusterID: 1 }, "day", "members", "instant", "1941-07-01", f, true)).toBe(false);
    expect(matches({ ...p, Posture: "Move" }, "day", "members", "instant", "1941-07-01", f, true)).toBe(false);
    expect(layerFilter("day", "members", "instant", "1941-07-01", f, true)).toEqual([
      "all", ["==", ["get", "Date"], ["literal", "1941-07-01"]], ["==", ["get", "Geo_ClusterID"], 2], ["==", ["to-string", ["get", "Posture"]], "Attack"],
    ]);
  });
});

describe("dates", () => {
  it("adds days across month ends without time-zone drift", () => {
    expect(addDays("1941-06-30", 1)).toBe("1941-07-01");
    expect(daysBetween("1941-06-22", "1941-08-05")).toBe(44);
  });
});

describe("phase-line crossings", () => {
  // A vertical phase line at lon 25 between lat 49 and 51; planned to be passed by 1941-07-01.
  const line: Feature = { type: "Feature", properties: { line_id: "a", name: "Test", planned_date: "~1 Jul", date_end: "1941-07-01" },
    geometry: { type: "LineString", coordinates: [[25, 51], [25, 49]] } };
  const points = [
    pt(24, 50, { Date: "1941-06-28" }), pt(24, 50, { Date: "1941-06-28" }),
    pt(26, 50, { Date: "1941-06-30" }), pt(24, 50, { Date: "1941-06-30" }), pt(24, 50, { Date: "1941-06-30" }),
    pt(26, 50, { Date: "1941-07-03" }), pt(26, 50.5, { Date: "1941-07-03" }), pt(24, 50, { Date: "1941-07-03" }),
    pt(30, 55, { Date: "1941-06-28" }), // outside the line's latitude band: ignored
  ];
  it("finds lead and main-body crossing days and the delay", () => {
    const [c] = crossings([line], points, "1941-07-03");
    expect(c.lead).toBe("1941-06-30");
    expect(c.main).toBe("1941-07-03");
    expect(c.delay).toBe(2);
    expect(c.shareToday).toBeCloseTo(2 / 3);
  });
});

describe("file import / export", () => {
  it("parses quoted CSV and builds points from lat/lon columns", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\r\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
    const fc = csvToPoints("name,lat,lon\nKiev,50.45,30.52\nbad,abc,1\n");
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry).toEqual({ type: "Point", coordinates: [30.52, 50.45] });
  });
  it("exports CSV with escaped values and a lon/lat column", () => {
    const csv = toCsv([pt(30, 50, { name: 'A "b", c', n: 1 })]);
    expect(csv).toBe('name,n,lon,lat\n"A ""b"", c",1,30,50');
  });
});

describe("workspace", () => {
  it("round-trips through serialize → applyWorkspace and rejects foreign files", async () => {
    const { serialize, applyWorkspace } = await import("@/io/workspace");
    const { get, set, initialState } = await import("@/state/store");
    set({ page: "smolensk", mode: "progressive", date: "1941-08-01", theme: "period", filters: { geo: 3, dv: null, chart: null } });
    const saved = JSON.parse(JSON.stringify(serialize(get())));
    set(initialState);
    expect(applyWorkspace(saved)).toBe(true);
    expect(get()).toMatchObject({ page: "smolensk", mode: "progressive", date: "1941-08-01", theme: "period", filters: { geo: 3 } });
    expect(applyWorkspace({ app: "Other" })).toBe(false);
    expect(applyWorkspace({ ...saved, page: "atlantis" })).toBe(true);
    expect(get().page).toBe("smolensk"); // invalid page ignored
  });
});

describe("AGOL refresh paging", () => {
  it("pages by resultOffset until a short page and checks the count", async () => {
    const { fetchAll } = await import("@/io/agolRefresh");
    const total = 2500, size = 1000;
    const fetcher = async (url: string, p: Record<string, string | number> = {}) => {
      if (!url.endsWith("/query")) return { maxRecordCount: size, objectIdField: "OBJECTID" };
      if (p.returnIdsOnly) return { objectIds: Array.from({ length: total }, (_, i) => i + 1) };
      const n = Math.max(0, Math.min(size, total - Number(p.resultOffset)));
      return { features: Array.from({ length: n }, (_, i) => ({ type: "Feature", properties: { i: Number(p.resultOffset) + i }, geometry: null })) };
    };
    const { feats } = await fetchAll("https://x/FeatureServer/0", true, fetcher);
    expect(feats).toHaveLength(total);
    expect(new Set(feats.map((f) => f.properties!.i)).size).toBe(total);
    await expect(fetchAll("https://x/FeatureServer/0", true, async (u, p = {}) => (p.returnIdsOnly ? { objectIds: Array.from({ length: 9 }) } : fetcher(u, p)))).rejects.toThrow(/2500 of 9/);
  });
});
