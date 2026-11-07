import { describe, expect, it } from "vitest";
import type { Feature } from "geojson";
import { agglomerative, averagePath, dailySegments, divKey, kmeans, projection, recluster, relabel, silhouette, type Pt, type Track } from "./cluster";
import { fitSegments } from "./vectors";
import { containment, frechet, pairLines, scores, signedOffsets } from "./planMatch";

// Reference values below come from the Python functions in analysis/compare_loa.py run on the same inputs.
const ZIG: Pt[] = [[0, 0], [100, 0], [150, 80], [300, 80]];

describe("clustering", () => {
  const blobs = [[0, 0], [1, 1], [0, 1], [50, 50], [51, 50], [50, 51], [100, 0], [101, 1]];
  it("k-means splits obvious blobs, the same way every time", () => {
    const a = kmeans(blobs, 3), b = kmeans(blobs, 3);
    expect(a).toEqual(b);
    expect(new Set(a.slice(0, 3)).size).toBe(1);
    expect(new Set([a[0], a[3], a[6]]).size).toBe(3);
  });
  it("average linkage and silhouette on a hand-checked case", () => {
    const D = blobs.map((p) => blobs.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])));
    const lab = agglomerative(D, 3);
    expect(new Set([lab[0], lab[1], lab[2]]).size).toBe(1);
    expect(lab[3]).toBe(lab[5]);
    expect(silhouette(D, lab)).toBeGreaterThan(0.95);
  });
  it("average path splits into daily segments in the published schema", () => {
    const t: Track = { key: "a", pts: [[0, 0], [100, 0]], days: [0, 4] };
    const avg = averagePath([t, { ...t, pts: [[0, 10], [100, 10]] }]);
    expect(avg.pts[0][1]).toBeCloseTo(5);
    const segs = dailySegments(avg, 2, 2, projection(29, 50));
    expect(segs).toHaveLength(5);
    expect(segs[0].properties).toMatchObject({ Cluster_ID: 2, Day_Index: 1, CID_div_total: 2 });
    expect(Number(segs[1].properties!.Speed_km_day)).toBeGreaterThan(15);
  });
  it("re-clusters paths and relabels points by division", () => {
    const seg = (nation: string, num: number, from: number[], to: number[]): Feature => ({ type: "Feature",
      properties: { Nation: nation, Branch: "Infantry", Num_Name: num, Start_Date: "1941-06-22", End_Date: "1941-07-01" },
      geometry: { type: "LineString", coordinates: [from, to] } });
    const paths = { type: "FeatureCollection" as const, features: [
      seg("A", 1, [24, 51], [30, 51]), seg("A", 2, [24, 51.1], [30, 51.1]), seg("A", 3, [24, 49], [30, 48.5]), seg("A", 4, [24, 49.1], [30, 48.6]),
      seg("A", 5, [24, 50], [24.5, 50]) ] };
    const r = recluster(paths, { preset: "custom", dvK: 2, geoK: 2, minMoveKm: 100 });
    expect(r.info.stayedBehind).toEqual(["A|Infantry|5"]);
    expect(r.info.members.dv.get("A|Infantry|1")).toBe(0); // north first
    expect(r.info.members.dv.get("A|Infantry|3")).toBe(1);
    const pts = relabel({ type: "FeatureCollection", features: [{ type: "Feature", properties: { Nation: "A", Branch_Type: "Infantry", Num_Name: 5 }, geometry: { type: "Point", coordinates: [24, 50] } }] }, r.info);
    expect(pts.features[0].properties).toMatchObject({ DV_ClusterID: null, Geo_ClusterID: null });
    expect(divKey({ Nation: "A", Branch_Type: "Infantry", Num_Name: 5 })).toBe("A|Infantry|5");
  });
});

describe("ported vector fit and plan comparison", () => {
  it("fit_segments matches the Python reference", () => {
    const two = fitSegments(ZIG, 2, 60);
    expect(two.V[1][0]).toBeCloseTo(216.1, 0);
    expect(two.rms).toBeCloseTo(15.29, 1);
    const three = fitSegments(ZIG, 3, 60);
    expect(three.V[1][0]).toBeCloseTo(100.7, 0);
    expect(three.rms).toBeCloseTo(0.36, 1);
  });
  it("Fréchet, offsets and containment match the Python reference", () => {
    expect(frechet([[0, 0], [100, 10], [200, 0]], [[0, 40], [120, 30], [200, 45]])).toBeCloseTo(45, 1);
    const off = signedOffsets([[0, 0], [200, 0]], [[0, 30], [200, 30]]);
    expect(off).toHaveLength(20);
    expect(off[0][1]).toBeCloseTo(30);
    expect(containment([[0, 0], [200, 0]], [[0, 30], [100, 30], [100, 80], [200, 80]], 50)).toBeCloseTo(0.75);
  });
  it("pairs each planned line with its nearest cluster", () => {
    const planned = { n: [[0, 100], [300, 100]] as Pt[], s: [[0, 0], [300, 0]] as Pt[] };
    const clusters = new Map<number, Pt[]>([[0, [[0, 5], [300, 5]]], [1, [[0, 95], [300, 95]]], [2, [[0, 400], [300, 400]]]]);
    expect(pairLines(planned, clusters)).toEqual({ n: 1, s: 0 });
  });
  it("scores match compare_loa.scores()", () => {
    expect(scores(3, 10, 12)).toEqual({ score_direction: 100, score_route: 100, score_destination: 100, score_overall: 100 });
    expect(scores(-27.5, 60, 200)).toEqual({ score_direction: 44, score_route: 50, score_destination: 0, score_overall: 31 });
  });
});
