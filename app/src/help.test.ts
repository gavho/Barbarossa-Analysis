import { describe, expect, it } from "vitest";
import { HELP } from "@/config/help";
import { REGION_LAYERS } from "@/config/presets";

// Every component source as text (Vite feature; no Node types needed).
const sources = import.meta.glob("./**/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("help popovers", () => {
  it("every literal <Help id> and every ChartCard help id has text", () => {
    const ids = Object.values(sources).flatMap((src) => [...src.matchAll(/(?:<Help id|\bhelp)="(\w+)"/g)].map((m) => m[1]));
    expect(ids.length).toBeGreaterThan(15);
    expect(ids.filter((id) => !HELP[id])).toEqual([]);
  });
  it("every region layer and the Vectors panel's dynamic ids are explained", () => {
    const layerIds = REGION_LAYERS.map((d) => (d.id.endsWith("vec") ? "vectors" : d.id));
    expect(layerIds.filter((id) => !HELP[id])).toEqual([]);
    for (const id of ["dv", "geo", "avgPath", "vectors"]) expect(HELP[id]).toBeTruthy();
  });
});
