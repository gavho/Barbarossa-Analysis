import { Eye, EyeOff } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { PLAN_MATCH, type PlanPair } from "@/data";
import { PUBLISHED, RECOMMENDED } from "@/lib/cluster";
import { divisionName, regionOf, settingsOf } from "@/state/clusters";
import { CLUSTER_COLORS } from "@/config/presets";
import { mapRef } from "@/map/MapView";
import { set, setStyle, styleOf, useStore } from "@/state/store";
import { Help } from "@/ui/Help";
import { Segmented } from "@/ui/Segmented";
import { cn } from "@/lib/utils";

const color = (cid: number) => CLUSTER_COLORS.find((c) => c.value === cid)?.color ?? "#888";
const BADGE: Record<PlanPair["badge"], string> = {
  "on plan": "bg-primary/15 text-primary", "near plan": "bg-muted text-foreground", "off plan": "bg-danger/15 text-danger",
};
const LAYERS = ["matchplan", "matchreal"] as const;

/** One shared frame for every card's mini map, so distances look the same in all of them (equirectangular, north up). */
function frame(pairs: PlanPair[]) {
  const all = pairs.flatMap((p) => [...p.planned_line, ...p.realized_line]);
  const lat0 = all.reduce((a, c) => a + c[1], 0) / all.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = all.map((c) => c[0] * k), ys = all.map((c) => c[1]);
  const pad = 0.6, x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  const W = 300, H = Math.round((W * (y1 - y0)) / (x1 - x0));
  const sc = W / (x1 - x0);
  const pt = ([lon, lat]: number[]) => `${((lon * k - x0) * sc).toFixed(1)},${((y1 - lat) * sc).toFixed(1)}`;
  return { W, H, pt, kmPx: sc / 111 }; // 1° of latitude ≈ 111 km
}

function MiniMap({ p, f }: { p: PlanPair; f: ReturnType<typeof frame> }) {
  const planned = p.planned_line.map(f.pt).join(" "), real = p.realized_line.map(f.pt).join(" ");
  return (
    <svg viewBox={`0 0 ${f.W} ${f.H}`} className="w-full rounded-sm bg-background" role="img" aria-label={`${p.name}: planned and realized lines`}>
      {/* the 50 km corridor: the planned line drawn 100 km wide */}
      <polyline points={planned} fill="none" stroke="var(--foreground)" strokeOpacity={0.12} strokeWidth={100 * f.kmPx} strokeLinecap="round" strokeLinejoin="round" />
      {Object.entries(PLAN_MATCH.towns).map(([name, ll]) => {
        const [x, y] = f.pt(ll).split(",").map(Number);
        return <g key={name} fontSize={7} fill="var(--muted-foreground)"><circle cx={x} cy={y} r={1.4} /><text x={x + 3} y={y - 2}>{name}</text></g>;
      })}
      <polyline points={planned} fill="none" stroke="var(--foreground)" strokeWidth={1.8} strokeDasharray="5 3" />
      <polyline points={real} fill="none" stroke={color(p.cluster)} strokeWidth={2.2} strokeLinejoin="round" />
    </svg>
  );
}

function GapStrip({ p }: { p: PlanPair }) {
  const data = p.profile.map(([km, off]) => ({ km, off }));
  return (
    <ResponsiveContainer width="100%" height={74}>
      <LineChart data={data} margin={{ top: 4, right: 6, left: -22, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <ReferenceArea y1={-20} y2={20} fill="var(--muted-foreground)" fillOpacity={0.18} />
        <ReferenceLine y={0} stroke="var(--foreground)" strokeDasharray="5 3" />
        <XAxis dataKey="km" type="number" domain={[0, "dataMax"]} tick={{ fill: "var(--muted-foreground)", fontSize: 9 }} unit=" km" />
        <YAxis domain={[-100, 100]} ticks={[-100, 0, 100]} tickFormatter={(v: number) => (v > 0 ? "N" : v < 0 ? "S" : "0")}
          tick={{ fill: "var(--muted-foreground)", fontSize: 9 }} />
        <Line dataKey="off" stroke={color(p.cluster)} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function Bar({ label, value, big }: { label: string; value: number; big?: boolean }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-1.5">
      <span className={cn("text-muted-foreground", big ? "text-[12px] font-medium text-foreground" : "text-[11px]")}>{label}</span>
      <span className="h-1.5 overflow-hidden rounded bg-muted"><span className="block h-full rounded bg-primary" style={{ width: `${value}%`, opacity: big ? 1 : 0.6 }} /></span>
      <span className="text-right font-mono text-[11px]">{value}</span>
    </div>
  );
}

/** Overall agreement with the plan and its three parts, 0-100 (100 = within mapping error). */
function Scores({ p }: { p: PlanPair }) {
  return (
    <div className="mt-1.5 flex flex-col gap-0.5" aria-label="Plan agreement scores">
      <div className="flex items-center gap-1"><Bar label="Plan agreement" value={p.score_overall} big /><Help id="planScores" /></div>
      <Bar label="Direction" value={p.score_direction} />
      <Bar label="Route" value={p.score_route} />
      <Bar label="Destination" value={p.score_destination} />
    </div>
  );
}

/** Planned AGS lines of advance next to the realized groups they match, in pictures and plain words. Frontier only. */
export function PlanMatch() {
  const s = useStore();
  const st = settingsOf(s, "frontier"), live = regionOf(s, "frontier");
  const m = live.plan ?? PLAN_MATCH.DV;
  const behind = live.info?.stayedBehind ?? [];
  const f = frame(m.pairs);
  const onMap = styleOf(s, "matchreal").visible;
  const show = (on: boolean) => LAYERS.forEach((id) => setStyle(id, { visible: on }));

  const focus = (p: PlanPair) => {
    set({ planFocus: p.planned });
    show(true);
    const c = [...p.planned_line, ...p.realized_line];
    const xs = c.map((q) => q[0]), ys = c.map((q) => q[1]);
    mapRef?.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 70, duration: 800 });
  };

  return (
    <section className="flex flex-col gap-2.5" aria-label="Planned vs actual">
      <div className="flex items-center justify-between gap-2">
        <h3 className="display flex items-center gap-1.5 text-[15px]">Planned vs actual <Help id="planVsActual2" /></h3>
        <button onClick={() => { set({ planFocus: null }); show(!onMap); }} aria-pressed={onMap}
          className={cn("flex shrink-0 items-center gap-1 rounded-[var(--radius)] border px-2 py-1 text-[12px]", onMap ? "border-primary bg-primary/15" : "border-border hover:bg-muted")}>
          {onMap ? <Eye size={13} /> : <EyeOff size={13} />} {onMap ? "On map" : "Show on map"}
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <Segmented<string> size="sm" value={st.preset}
          onChange={(v) => v !== "custom" && set({ clusters: { ...s.clusters, frontier: v === "published" ? PUBLISHED : RECOMMENDED }, planFocus: null })}
          items={[{ value: "published", label: "Published (5)" }, { value: "recommended", label: "Recommended (4)" },
            ...(st.preset === "custom" ? [{ value: "custom", label: `Custom (${st.dvK})` }] : [])]} />
        <Help id="whyFour" />
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {behind.length > 0 && <>Stayed behind, not compared ({behind.length}): {behind.map(divisionName).join(", ")}. </>}
        {m.unmatched.length > 0 && <>Not matched to any planned line: cluster {m.unmatched.join(", ")}. </>}
        Change the grouping in the Clusters tab on the left.
      </p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="var(--foreground)" strokeWidth="1.8" strokeDasharray="5 3" /></svg> planned</span>
        <span>solid: realized group</span>
        <span className="flex items-center gap-1">pale band: within 50 km <Help id="planCorridor" /></span>
      </p>

      {m.pairs.map((p) => (
        <article key={p.planned} className={cn("frame p-2.5", s.planFocus && s.planFocus !== p.planned && "opacity-50")} aria-label={p.name}>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <h4 className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color(p.cluster) }} aria-hidden />
              <span className="truncate">{p.name}</span>
            </h4>
            <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium", BADGE[p.badge])}>{p.badge}</span>
          </div>
          <MiniMap p={p} f={f} />
          <Scores p={p} />
          <p className="mt-1.5 text-[12px] leading-snug">{p.sentence.split(": ").slice(1).join(": ")}</p>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">Gap along the way <Help id="gapStrip" /></div>
          <GapStrip p={p} />
          <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Matched group: {p.divisions} divisions</span>
            <button onClick={() => focus(p)} className="text-primary hover:underline" aria-label={`Show ${p.name} on the map`}>show on map</button>
          </div>
        </article>
      ))}
    </section>
  );
}
