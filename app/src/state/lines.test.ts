import { describe, expect, it } from "vitest";
import { MILESTONES, PLAN_MATCH } from "@/data";
import { initialState } from "./store";
import { regionOf } from "./clusters";
import { breaksOf, linesOf } from "./lines";

describe("redrawn lines", () => {
  it("swap into the map layer only once they have two points", () => {
    expect(linesOf({ phase: { "1": [[25, 50]] }, advance: {} }, "phase")).toEqual(MILESTONES.AGS_PhaseLines);
    const f = linesOf({ phase: { "1": [[25, 51], [25, 49]] }, advance: {} }, "phase").features.find((x) => x.properties?.line_id === "1")!;
    expect(f.properties?.edited).toBe(true);
  });

  it("a moved date recomputes the natural breaks", () => {
    const b = breaksOf({ ...initialState, phaseDates: { "1": "1941-07-03" } }, "1")!;
    expect(b.summary.date).toBe("1941-07-03");
    expect(b.dots.features.every((f) => f.properties?.date === "1941-07-03")).toBe(true);
  });

  it("an unchanged line of advance redrawn gives the published pairing", () => {
    const s = { ...initialState, lineEdits: { phase: {}, advance: { "6A": PLAN_MATCH.planned["6A"] } } };
    const pair = (ps: { planned: string; cluster: number }[]) => Object.fromEntries(ps.map((p) => [p.planned, p.cluster]));
    expect(pair(regionOf(s, "frontier").plan!.pairs)).toEqual(pair(PLAN_MATCH.DV.pairs));
  });
});
