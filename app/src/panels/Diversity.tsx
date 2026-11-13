import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { LineString } from "geojson";
import { MapPin } from "lucide-react";
import { FORMATION_COLORS } from "@/config/presets";
import { PHASE_CHECKS } from "@/data";
import { mapRef } from "@/map/MapView";
import { set, showOnly, useStore } from "@/state/store";
import { Help } from "@/ui/Help";
import { Segmented } from "@/ui/Segmented";
import { cn } from "@/lib/utils";
import { color } from "./Phases";

const CLUSTERS = ["N", "Central", "South", "South Minor"];
const LINES = [...new Set(PHASE_CHECKS.diversity.map((r) => r.line))];
const cell = (L: string, c: string) => PHASE_CHECKS.diversity.find((r) => r.line === L && r.cluster === c);
const mix = (f: Record<string, number>) => Object.entries(f).map(([u, n]) => `${u} ${n}`).join(", ") || "none";
const fmt = (v: number | null | undefined) => (v == null ? "–" : v.toFixed(2));
const UNIT_NAMES: Record<string, string> = { "6A": "6th Army", "III PzKo": "III Panzer Corps", "PzGp1(-)": "Panzer Group 1", "17A": "17th Army" };

/** One phase line on the map: its clusters as labelled spans of the line, and the crossings coloured by greater unit. */
function show(L: string) {
  set({ phaseStep: L });
  showOnly(["divspans", "divdots", "checklines"]);
  const c = PHASE_CHECKS.diversity_spans.features.filter((f) => f.properties?.line === L).flatMap((f) => (f.geometry as LineString).coordinates);
  if (!c.length) return;
  const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
  mapRef?.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 60, duration: 800 });
}

/** Greater-unit diversity of the four clusters of crossings at each phase line, relative to the whole line's mix. */
export function Diversity() {
  const step = useStore((s) => s.phaseStep);
  const onMap = useStore((s) => LINES.includes(s.phaseStep));
  const series = LINES.map((L) => ({ phase: `Phase ${L}`, ...Object.fromEntries(CLUSTERS.map((c) => [c, cell(L, c)?.normalized ?? null])) }));
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="display flex items-center gap-1.5 text-[15px]">Greater-unit diversity <Help id="diversity" /></h3>
        <button onClick={() => show(onMap ? step : LINES[0])} className="flex shrink-0 items-center gap-1 rounded-[var(--radius)] border border-border px-2 py-1 text-[12px] hover:bg-muted">
          <MapPin size={13} /> Show on map
        </button>
      </div>
      <Segmented<string> size="sm" value={onMap ? step : ""} onChange={show} items={LINES.map((L) => ({ value: L, label: `Phase ${L}` }))} />
      <section className="frame overflow-x-auto p-2.5">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-normal">Line</th>
              {CLUSTERS.map((c, i) => <th key={c} className="text-right font-normal"><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: color(i) }} />{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {LINES.map((L) => (
              <tr key={L} onClick={() => show(L)} aria-selected={onMap && step === L}
                className={cn("cursor-pointer border-t border-border hover:bg-muted", onMap && step === L && "bg-primary/10")}>
                <td className="py-1">Phase {L}</td>
                {CLUSTERS.map((c) => {
                  const r = cell(L, c);
                  return (
                    <td key={c} className="py-1 text-right" title={r ? `${r.divisions} divisions: ${mix(r.formations)}` : undefined}>
                      <span className="font-mono">{fmt(r?.normalized)}</span>
                      <span className="block text-[10px] text-muted-foreground">{r?.divisions ?? 0} div.</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {onMap && (
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>Map, phase {step}: grey bands = the clusters' stretch of the line; dots = crossings by greater unit:</span>
          {Object.entries(FORMATION_COLORS).map(([u, c]) => (
            <span key={u} className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c }} />{UNIT_NAMES[u]}</span>
          ))}
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-[#9aa3ad]" />other</span>
        </p>
      )}
      <ResponsiveContainer width="100%" height={190}>
        <LineChart data={series} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <ReferenceLine y={1} stroke="var(--foreground)" strokeDasharray="4 3" />
          <XAxis dataKey="phase" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
          <YAxis domain={[0, (max: number) => Math.max(1.1, Math.ceil(max * 10) / 10)]} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
          <Tooltip formatter={(v) => fmt(v as number)} contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", fontSize: 11 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {CLUSTERS.map((c, i) => <Line key={c} dataKey={c} stroke={color(i)} strokeWidth={2} isAnimationActive={false} connectNulls={false} />)}
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Each value is a cluster's entropy over the four greater units (6th Army, III Panzer Corps, Panzer Group 1 less III Corps,
        17th Army) divided by the entropy of all divisions crossing that line. 1 = as mixed as the whole front there; 0 = one greater unit.
        "–" = no division of the four greater units. Hover a cell for its divisions. Published values: they do not follow redrawn lines.
      </p>
    </div>
  );
}
