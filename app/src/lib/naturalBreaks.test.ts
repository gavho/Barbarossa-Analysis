import { describe, expect, it } from "vitest";
import type { LineString } from "geojson";
import { EMBEDDED, MILESTONES, PHASE_PROFILES } from "@/data";
import { parseTowns } from "@/config/towns";
import { breaksOnDate, jenks } from "./naturalBreaks";

describe("natural breaks in the browser", () => {
  it("jenks splits obvious clumps", () => {
    expect(jenks([0, 1, 2, 50, 51, 52], 2).breaks).toEqual([26]);
    expect(jenks([0, 1, 2, 50, 51, 52], 2).gvf).toBeGreaterThan(0.99);
  });

  it("reproduces the published analysis on the planned dates and lines", () => {
    for (const s of PHASE_PROFILES.jenks.summary) {
      const line = MILESTONES.AGS_PhaseLines.features.find((f) => f.properties?.line_id === s.phase)!.geometry as LineString;
      const live = breaksOnDate(EMBEDDED.regions.frontier.points, line.coordinates, s.date, s.phase)!;
      expect(live.summary.divisions, `phase ${s.phase}`).toBe(s.divisions);
      expect(live.summary.bins, `phase ${s.phase}`).toBe(s.bins);
      for (const c of ["past", "straddling", "behind"] as const) expect(Math.abs(live.summary[c] - s[c]), `phase ${s.phase} ${c}`).toBeLessThanOrEqual(1); // numpy rounds halves to even
      const pub = PHASE_PROFILES.jenks.bins.filter((b) => b.phase === s.phase);
      expect(live.bins.map((b) => [b.bin, b.divisions, b.past]), `phase ${s.phase}`).toEqual(pub.map((b) => [b.bin, b.divisions, b.past]));
    }
  });

  it("reads the milestone town lists", () => {
    for (const f of MILESTONES.AGS_PhaseLines.features) expect(parseTowns(String(f.properties?.towns)).unknown).toEqual([]);
  });
});
