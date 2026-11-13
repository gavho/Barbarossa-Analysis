import { MILESTONES, PHASE_PROFILES, PLAN_MATCH, type Dataset, type FC } from "@/data";
import { snapTown } from "@/config/towns";
import { breaksOnDate, type Breaks } from "@/lib/naturalBreaks";
import { get, set, type LineKind, type State } from "./store";

const LAYER = { phase: "AGS_PhaseLines", advance: "AGS_AdvanceLines" } as const;
export const lineId = (kind: LineKind, p: Record<string, unknown> | null) => String(kind === "phase" ? p?.line_id : p?.unit);
const drawn = (c?: number[][]) => !!c && c.length >= 2;

/** A drawn line's points by town name where they sit on one, else as coordinates. */
export const townNames = (c: number[][]) => c.map((ll) => snapTown(ll, 1)?.name ?? `${ll[1].toFixed(2)}N ${ll[0].toFixed(2)}E`).join(" - ");

const linesMemo = new WeakMap<object, FC>();
/** The planned lines with any redrawn ones (2+ points) swapped in and marked `edited`. */
export function linesOf(edits: State["lineEdits"], kind: LineKind): FC {
  const e = edits[kind], src = MILESTONES[LAYER[kind]];
  if (!linesMemo.has(e)) linesMemo.set(e, { ...src, features: src.features.map((f) => {
    const c = e[lineId(kind, f.properties)];
    return drawn(c) ? { ...f, properties: { ...f.properties, towns: townNames(c), edited: true }, geometry: { type: "LineString" as const, coordinates: c } } : f;
  }) });
  return linesMemo.get(e)!;
}

/** Planned lines of advance for the plan comparison, redrawn ones swapped in. */
export const plannedOf = (edits: State["lineEdits"]): Record<string, number[][]> =>
  ({ ...PLAN_MATCH.planned, ...Object.fromEntries(Object.entries(edits.advance).filter(([, c]) => drawn(c))) });

const J = PHASE_PROFILES.jenks;
const fc = (features: FC["features"]): FC => ({ type: "FeatureCollection", features });
const published = new Map(J.summary.map((x) => [x.phase, { summary: x, bins: J.bins.filter((b) => b.phase === x.phase),
  dots: fc(J.dots.features.filter((f) => f.properties?.phase === x.phase)),
  breaklines: fc(J.breaklines.features.filter((f) => f.properties?.phase === x.phase)) } as Breaks]));
export const plannedDate = (phase: string) => published.get(phase)?.summary.date ?? "";

const breaksMemo = new WeakMap<Dataset, Map<string, Breaks | null>>();
/** Natural breaks for a phase: the published analysis, or redone live when its date or line was changed. */
export function breaksOf(s: Pick<State, "data" | "phaseDates" | "lineEdits">, phase: string): Breaks | null {
  const date = s.phaseDates[phase], line = s.lineEdits.phase[phase];
  if (!date && !drawn(line)) return published.get(phase) ?? null;
  const memo = breaksMemo.get(s.data) ?? breaksMemo.set(s.data, new Map()).get(s.data)!, key = JSON.stringify([phase, date, line]);
  if (!memo.has(key)) {
    const coords = linesOf(s.lineEdits, "phase").features.find((f) => lineId("phase", f.properties) === phase)?.geometry;
    memo.set(key, coords?.type === "LineString"
      ? breaksOnDate(s.data.regions.frontier.points, coords.coordinates, date ?? plannedDate(phase), phase) : null);
  }
  return memo.get(key)!;
}

export function setLine(kind: LineKind, id: string, coords: number[][] | null) {
  const e = get().lineEdits, { [id]: _, ...rest } = e[kind];
  set({ lineEdits: { ...e, [kind]: coords ? { ...rest, [id]: coords } : rest } });
}

/** A map click while drawing: the next point of the line, snapped to a town when one is close. */
export function addPoint(ll: number[]) {
  const d = get().drawing;
  if (!d) return;
  const t = snapTown(ll);
  setLine(d.kind, d.id, [...(get().lineEdits[d.kind][d.id] ?? []), t ? t.ll : ll.map((v) => Math.round(v * 1e4) / 1e4)]);
}
