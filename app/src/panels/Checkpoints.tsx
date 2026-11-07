import { useMemo } from "react";
import { Eye, EyeOff } from "lucide-react";
import { ResponsiveContainer, Sankey, Tooltip } from "recharts";
import type { Point } from "geojson";
import { Segmented } from "@/ui/Segmented";
import { FORMATION_COLORS } from "@/config/presets";
import { PHASE_CHECKS, PHASE_PROFILES, PHASE_SHIFTS, type CheckGroup } from "@/data";
import { mapRef } from "@/map/MapView";
import { set, setStyle, styleOf, useStore } from "@/state/store";
import { Help } from "@/ui/Help";
import { cn } from "@/lib/utils";
import { color, separation, Swatch } from "./Phases";

const LAYERS = ["checklines", "checkpaths", "checkdots"] as const;
const STOPPED = "var(--muted-foreground)";
const northFirst = (a: CheckGroup, b: CheckGroup) => b.lonlat[1] - a.lonlat[1];
/** "Start" is the 22 June line-up before phase A; everything else is a phase line. */
const lineName = (L: string) => (L === "Start" ? "Start" : `Phase ${L}`);
const stretchKey = (L: string) => (L === "Start" ? "Frontier" : L); // the first stretch is "Frontier-A"
const coords = (c: unknown): number[][] => (typeof (c as unknown[])[0] === "number" ? [c as number[]] : (c as unknown[]).flatMap(coords));

/** "near A 28% · midway 30% · near B 42%" for the stretch whose name matches. */
function bunched(match: (stretch: string) => boolean) {
  const p = PHASE_PROFILES.profiles.find((x) => match(x.stretch));
  return p ? p.bands.map((x) => `${x.band} ${x.share}%`).join(" · ") : null;
}

interface FlowNode { name: string; fill: string }

/** Columns = phase lines, blocks = groups north to south, plus a grey "did not reach" block per phase.
 * Bands are split by formation (one colour per greater unit), so the structure is the battle and the colour is who fought in it. */
function flowData() {
  const nodes: FlowNode[] = [];
  const index = new Map<string, number>();
  for (const L of PHASE_CHECKS.lines) {
    for (const g of PHASE_CHECKS.groups.filter((x) => x.line === L).sort(northFirst)) {
      index.set(`${L}|${g.group}`, nodes.length);
      nodes.push({ name: `${lineName(L)} · ${g.sector} group${g.entropy === null ? "" : ` · diversity ${g.entropy}`}`, fill: color(g.group) });
    }
    if (PHASE_CHECKS.flows.some((f) => f.to_line === L && f.to_group === null)) {
      index.set(`${L}|stop`, nodes.length);
      nodes.push({ name: `Did not reach phase ${L}`, fill: STOPPED });
    }
  }
  const links = PHASE_CHECKS.flows.flatMap((f) => Object.entries(f.formations).map(([unit, n]) => ({
    source: index.get(`${f.from_line}|${f.from_group}`)!, target: index.get(`${f.to_line}|${f.to_group ?? "stop"}`)!, value: n,
    fill: FORMATION_COLORS[unit] ?? STOPPED,
  })));
  return { nodes, links };
}

interface NodeProps { x: number; y: number; width: number; height: number; payload: FlowNode & { value: number } }
const FlowBlock = ({ x, y, width, height, payload }: NodeProps) => (
  <g>
    <rect x={x} y={y} width={width} height={height} fill={payload.fill} rx={1.5} />
    {height >= 11 && <text x={x + width + 3} y={y + height / 2 + 3.5} fontSize={10} fill="var(--foreground)">{payload.value}</text>}
  </g>
);

interface LinkProps { sourceX: number; targetX: number; sourceY: number; targetY: number; sourceControlX: number; targetControlX: number;
  linkWidth: number; payload: { fill: string } }
const FlowBand = ({ sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload }: LinkProps) => (
  <path d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
    fill="none" stroke={payload.fill} strokeOpacity={0.55} strokeWidth={Math.max(1, linkWidth)} />
);

/** Who crossed each AGS phase line together, where and when; how the groups carried on, divided or stopped. */
export function Checkpoints() {
  const s = useStore();
  const visible = styleOf(s, "checkpaths").visible;
  const flow = useMemo(flowData, []);
  const show = (on: boolean) => LAYERS.forEach((id) => setStyle(id, { visible: on }));
  const lines = s.phaseStep === "all" ? PHASE_CHECKS.lines : [s.phaseStep];

  // One line at a time: the map keeps only that line, its crossings and the natural-break bands either side (syncLayers stepData).
  const step = (L: string) => {
    set({ phaseStep: L });
    if (L === "all") return;
    [...LAYERS, "naturalzones" as const].forEach((id) => setStyle(id, { visible: true }));
    const pts = PHASE_PROFILES.zones.features
      .filter((f) => String(f.properties?.stretch).split("-").includes(stretchKey(L)))
      .flatMap((f) => coords((f.geometry as { coordinates: unknown }).coordinates));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    mapRef?.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 40, duration: 800 });
  };

  const focus = (line: string, group: number) => {
    if (!visible) show(true);
    const pts = PHASE_CHECKS.crossings.features
      .filter((f) => f.properties?.line === line && f.properties?.group === group)
      .map((f) => (f.geometry as Point).coordinates);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    mapRef?.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 120, maxZoom: 8, duration: 800 });
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="display flex items-center gap-1.5 text-[15px]">Phase lines as checkpoints <Help id="checkpoints" /></h3>
        <button onClick={() => show(!visible)} aria-pressed={visible}
          className={cn("flex shrink-0 items-center gap-1 rounded-[var(--radius)] border px-2 py-1 text-[12px]", visible ? "border-primary bg-primary/15" : "border-border hover:bg-muted")}>
          {visible ? <Eye size={13} /> : <EyeOff size={13} />} {visible ? "On map" : "Show on map"}
        </button>
      </div>

      <section className="frame p-2" aria-label="Flow between phase lines">
        <h4 className="mb-1 flex items-center gap-1.5 text-[12px]">How the groups carried on from phase to phase <Help id="flowChart" /></h4>
        <ResponsiveContainer width="100%" height={230}>
          <Sankey data={flow} sort={false} align="left" nodePadding={12} nodeWidth={9} iterations={0}
            margin={{ top: 4, right: 18, bottom: 4, left: 2 }} node={FlowBlock as never} link={FlowBand as never}>
            <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11, color: "var(--foreground)" }}
              itemStyle={{ color: "var(--foreground)" }} />
          </Sankey>
        </ResponsiveContainer>
        <div className="flex justify-between pr-4 font-mono text-[10px] text-muted-foreground">
          {PHASE_CHECKS.lines.map((L) => <span key={L}>{lineName(L)}</span>)}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-2.5 text-[10px] text-muted-foreground">
          {Object.entries(FORMATION_COLORS).map(([unit, c]) => (
            <span key={unit} className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: c }} />{unit}</span>
          ))}
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: STOPPED }} />other</span>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-1.5">
        <Segmented<string> size="sm" value={s.phaseStep} onChange={step}
          items={[{ value: "all", label: "All" }, ...PHASE_CHECKS.lines.map((L) => ({ value: L, label: lineName(L) }))]} />
        <Help id="phaseStep" />
      </div>

      {lines.map((L) => {
        const groups = PHASE_CHECKS.groups.filter((g) => g.line === L).sort(northFirst);
        const crossed = groups.reduce((n, g) => n + g.divisions, 0);
        const shift = PHASE_SHIFTS.find((x) => x.to.startsWith(`${L}-`));
        const away = PHASE_CHECKS.splits.filter((x) => x.from_line === L);
        const start = L === "Start";
        const before = start ? null : bunched((x) => x.endsWith(`-${L}`)), after = bunched((x) => x.startsWith(`${stretchKey(L)}-`));
        return (
          <section key={L} className="frame p-2.5" aria-label={lineName(L)}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <h3 className="display shrink-0 text-[15px]">{start ? "Start · 22 June" : lineName(L)}</h3>
              <span className="flex items-center gap-1 text-right text-[11px] text-muted-foreground">
                {crossed} divisions {start ? "in the line-up" : "crossed"} · {separation(PHASE_CHECKS.info[L].silhouette)} <Help id="checkGroups" />
              </span>
            </div>
            <ul className="flex flex-col gap-1">
              {groups.map((g) => (
                <li key={g.group}>
                  <details className="rounded-[var(--radius)] border border-transparent hover:border-border">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-1.5 py-1 text-[12px]">
                      <Swatch cid={g.group} />
                      <span className="min-w-0 truncate">{g.divisions} divisions · {g.sector}{start ? "" : ` · ${g.first === g.last ? g.first : `${g.first} – ${g.last}`}`}</span>
                      <button onClick={(e) => { e.preventDefault(); focus(L, g.group); }} className="ml-auto shrink-0 text-[11px] text-primary hover:underline"
                        aria-label={`Show ${lineName(L)} ${g.sector} group on the map`}>map</button>
                    </summary>
                    <p className="px-1.5 pb-1.5 text-[11px] leading-relaxed text-muted-foreground">{start ? "" : `Half had crossed by ${g.median}. `}{g.members}.</p>
                  </details>
                </li>
              ))}
            </ul>
            {shift && <p className="mt-2 border-t border-border pt-1.5 text-[12px] leading-snug">{shift.sentence} <Help id="frontShape" /></p>}
            {(before || after) && (
              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 text-[11px] leading-relaxed">
                <dt className="col-span-2 flex items-center gap-1 text-muted-foreground">Where divisions bunched (share of division-days) <Help id="naturalzones" /></dt>
                {before && <><dt className="text-muted-foreground">Before {L}</dt><dd>{before}</dd></>}
                {after && <><dt className="text-muted-foreground">{start ? "Border to A" : `After ${L}`}</dt><dd>{after}</dd></>}
              </dl>
            )}
            {away.length > 0 && (
              <div className="mt-1.5 text-[11px] leading-relaxed">
                <span className="flex items-center gap-1 text-muted-foreground">Broke away before phase {away[0].to_line} <Help id="breakaway" /></span>
                {away.map((x) => <div key={x.division}><b>{x.division}</b> left <Swatch cid={x.from_group} /> and crossed with <Swatch cid={x.division_went_to} /></div>)}
              </div>
            )}
          </section>
        );
      })}
      <p className="text-[11px] text-muted-foreground">Start is the 22 June line-up (divisions first recorded later join at the first line they cross). Only one division had crossed phase E by 5 August, so the checkpoints stop at phase D.</p>
    </div>
  );
}
