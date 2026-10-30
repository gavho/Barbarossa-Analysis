import { useState } from "react";
import { Eye, EyeOff, Focus } from "lucide-react";
import type { Feature, LineString } from "geojson";
import { CLUSTER_COLORS } from "@/config/presets";
import { mapRef } from "@/map/MapView";
import { set, setStyle, styleOf, useStore } from "@/state/store";
import { Help } from "@/ui/Help";
import { Segmented } from "@/ui/Segmented";
import { cn } from "@/lib/utils";

type Kind = "dv" | "geo";
const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const compass = (d: number) => COMPASS[Math.round(d / 22.5) % 16];
const color = (cid: number) => CLUSTER_COLORS.find((c) => c.value === cid)?.color ?? "#888";
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** Vectorized cluster average paths with their statistics; every metric has a "?" explaining how it is computed. */
export function Vectors() {
  const s = useStore();
  const [kind, setKind] = useState<Kind>("dv");
  if (s.page === "home") return <p className="p-4 text-muted-foreground">Open a theater to see its cluster vectors.</p>;
  const id = kind === "dv" ? "dvvec" : "geovec";
  const style = styleOf(s, id);
  const feats = [...s.data.regions[s.page][id].features].sort((a, b) => Number(a.properties?.Cluster_ID) - Number(b.properties?.Cluster_ID));
  const active = kind === "dv" ? s.filters.dv : s.filters.geo;

  const focus = (f: Feature) => {
    if (!style.visible) setStyle(id, { visible: true });
    set({ selection: { layer: id, title: kind === "dv" ? "Directional Vector Cluster Vectors" : "Geometric Cluster Vectors", props: { ...f.properties } } });
    const c = (f.geometry as LineString).coordinates;
    const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
    mapRef?.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 90, maxZoom: 8, duration: 800 });
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Segmented<Kind> size="sm" value={kind} onChange={setKind}
            items={[{ value: "dv", label: "Directional vector" }, { value: "geo", label: "Geometric" }]} />
          <Help id={kind} />
        </div>
        <button onClick={() => setStyle(id, { visible: !style.visible })} aria-pressed={style.visible}
          className={cn("flex items-center gap-1 rounded-[var(--radius)] border px-2 py-1 text-[12px]", style.visible ? "border-primary bg-primary/15" : "border-border hover:bg-muted")}>
          {style.visible ? <Eye size={13} /> : <EyeOff size={13} />} {style.visible ? "On map" : "Show on map"}
        </button>
      </div>
      <p className="flex flex-wrap items-center gap-1 text-[12px] leading-relaxed text-muted-foreground">
        Each cluster's <span className="inline-flex items-center gap-1">average path <Help id="avgPath" /></span> reduced to
        <span className="inline-flex items-center gap-1">1–3 straight vectors <Help id="vectors" /></span>
      </p>
      {s.data.source.kind === "agol" && (
        <p className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground">Vectors come from the embedded snapshot; refreshed AGOL data does not recompute them.</p>
      )}
      {feats.map((f) => (
        <VectorCard key={String(f.properties?.Cluster_ID)} f={f} dim={active !== null && active !== f.properties?.Cluster_ID} onFocus={() => focus(f)} />
      ))}
    </div>
  );
}

function VectorCard({ f, dim, onFocus }: { f: Feature; dim: boolean; onFocus: () => void }) {
  const p = f.properties as Record<string, number | string | boolean | null>;
  const cid = Number(p.Cluster_ID);
  const n = Number(p.Vectors);
  const vecs = Array.from({ length: n }, (_, i) => ({ b: Number(p[`V${i + 1}_Bearing`]), km: Number(p[`V${i + 1}_km`]) }));
  const turns = Array.from({ length: n - 1 }, (_, i) => Number(p[`Turn${i + 1}`]));
  const rms = Number(p.Fit_RMS_km);
  return (
    <section className={cn("frame p-2.5 transition-opacity", dim && "opacity-45")} aria-label={`Cluster ${cid}`}>
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color(cid) }} aria-hidden />
        <h3 className="display text-[15px]">Cluster {cid}</h3>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {p.Members} division{p.Members === 1 ? "" : "s"} <Help id="members" />
        </span>
        {Number(p.Members) < 3 && <span className="rounded bg-danger/15 px-1 text-[10px] text-danger">few members</span>}
        <button onClick={onFocus} title="Show on map" aria-label={`Show cluster ${cid} on the map`} className="ml-auto text-muted-foreground hover:text-foreground"><Focus size={14} /></button>
      </div>
      <div className="mt-2 flex gap-3">
        <MiniVectors coords={(f.geometry as LineString).coordinates} stroke={color(cid)} />
        <dl className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1 text-[12px]">
          {turns.length > 0 && <Stat label="Turn" help="turn">{turns.map((t) => `${signed(t)}°`).join(", ")}</Stat>}
          <Stat label="Fit (RMS)" help="rms" warn={rms > 10}>{rms} km</Stat>
          <Stat label="Stable" help="stable">{p.Stable === null ? "n/a" : p.Stable ? "yes" : "no"}</Stat>
          {p.LOO_Bearing !== undefined && <Stat label="Line of ops" help="loo">{p.LOO_Bearing}° {compass(Number(p.LOO_Bearing))} · {p.LOO_km} km</Stat>}
          {p.Directness !== undefined && p.Directness !== null && <Stat label="Directness" help="directness">{Number(p.Directness).toFixed(2)}</Stat>}
        </dl>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 text-[12px]">
        <Stat label="Vectors" help="bearing">
          {vecs.map((v, i) => <span key={i} className="inline-block whitespace-nowrap">{i > 0 && "→ "}{v.b}° {compass(v.b)} · {v.km} km&nbsp;</span>)}
        </Stat>
      </dl>
      {p.Plan_Line && (
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1 border-t border-border pt-2 text-[12px]">
          <Stat label="Planned line" help="planMatch"><b>{String(p.Plan_Line)}</b></Stat>
          <Stat label="Fréchet" help="frechet" warn={Number(p.Plan_Frechet_km) > 20}>{p.Plan_Frechet_km} km</Stat>
          <Stat label="Mean offset" help="offset" warn={Math.abs(Number(p.Plan_Offset_km)) > 20}>
            {signed(Number(p.Plan_Offset_km))} km ({Number(p.Plan_Offset_km) >= 0 ? "north/left" : "south/right"}) · |{p.Plan_AbsOffset_km}| km avg · {p.Plan_Beyond_Noise_pct}% beyond noise <Help id="noise" />
          </Stat>
          <Stat label="Within 50 km" help="within50">{p.Plan_Within50_pct}%</Stat>
          <Stat label="Divisions agree" help="membership" warn={!p.Plan_Membership_Agrees}>{p.Plan_Membership_Agrees ? "yes" : "no"}</Stat>
        </dl>
      )}
    </section>
  );
}

function Stat({ label, help, warn, children }: { label: string; help: string; warn?: boolean; children: React.ReactNode }) {
  return (
    <>
      <dt className="flex items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground">{label} <Help id={help} /></dt>
      <dd className={cn("min-w-0 font-mono text-[11px]", warn && "text-danger")}>{children}</dd>
    </>
  );
}

/** The vectors drawn to scale (equirectangular, north up) with an arrowhead at the end. */
function MiniVectors({ coords, stroke }: { coords: number[][]; stroke: string }) {
  const W = 92, H = 56, pad = 8;
  const k = Math.cos((coords.reduce((a, c) => a + c[1], 0) / coords.length) * (Math.PI / 180));
  const pts = coords.map(([lon, lat]) => [lon * k, lat]);
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  const sc = Math.min(W - 2 * pad, H - 2 * pad) / span;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const xy = pts.map(([x, y]) => `${W / 2 + (x - cx) * sc},${H / 2 - (y - cy) * sc}`);
  const mid = `arrow-${stroke.slice(1)}`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 rounded-sm bg-background" role="img" aria-label="Vector shape, north up">
      <defs>
        <marker id={mid} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={stroke} />
        </marker>
      </defs>
      <polyline points={xy.join(" ")} fill="none" stroke={stroke} strokeWidth={2.4} strokeLinejoin="round" markerEnd={`url(#${mid})`} />
      {xy.slice(0, -1).map((q, i) => { const [x, y] = q.split(",").map(Number); return <circle key={i} cx={x} cy={y} r={i ? 2 : 2.6} fill={i ? stroke : "var(--foreground)"} />; })}
      <text x={W - 4} y={9} textAnchor="end" fontSize="7" fill="var(--muted-foreground)">N↑</text>
    </svg>
  );
}
