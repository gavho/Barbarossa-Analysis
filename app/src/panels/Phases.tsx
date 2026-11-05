import { Eye, EyeOff } from "lucide-react";
import type { Feature, LineString } from "geojson";
import { PHASES } from "@/data";
import { CLUSTER_COLORS } from "@/config/presets";
import { mapRef } from "@/map/MapView";
import { set, setStyle, styleOf, useStore } from "@/state/store";
import { Help } from "@/ui/Help";
import { Segmented } from "@/ui/Segmented";
import { cn } from "@/lib/utils";
import { compass } from "./Vectors";

const color = (cid: number) => CLUSTER_COLORS.find((c) => c.value === cid)?.color ?? "#888";

/** Clusters re-fitted within each stretch between AGS phase lines, and the divisions that split off between stretches. */
export function Phases() {
  const s = useStore();
  const { method, stretch } = s.phase;
  const visible = styleOf(s, "phaseavg").visible;
  const shown = stretch === "all" ? PHASES.stretches : [stretch];
  const setPhase = (p: Partial<typeof s.phase>) => set({ phase: { ...s.phase, ...p } });
  const toggleMap = () => { setStyle("phaseavg", { visible: !visible }); setStyle("phasepieces", { visible: !visible }); };

  const focus = (f: Feature) => {
    if (!visible) toggleMap();
    set({ selection: { layer: "phaseavg", title: "Phase · Cluster Paths", props: { ...f.properties } } });
    const c = (f.geometry as LineString).coordinates;
    const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
    mapRef?.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 90, maxZoom: 8, duration: 800 });
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Segmented<"DV" | "GEO"> size="sm" value={method} onChange={(m) => setPhase({ method: m })}
            items={[{ value: "DV", label: "Directional vector" }, { value: "GEO", label: "Geometric" }]} />
          <Help id={method === "DV" ? "dv" : "geo"} />
        </div>
        <button onClick={toggleMap} aria-pressed={visible}
          className={cn("flex items-center gap-1 rounded-[var(--radius)] border px-2 py-1 text-[12px]", visible ? "border-primary bg-primary/15" : "border-border hover:bg-muted")}>
          {visible ? <Eye size={13} /> : <EyeOff size={13} />} {visible ? "On map" : "Show on map"}
        </button>
      </div>
      <label className="flex items-center gap-2 text-[12px]">
        <span className="flex shrink-0 items-center gap-1 text-muted-foreground">Stretch <Help id="phaseClusters" /></span>
        <select value={stretch} onChange={(e) => setPhase({ stretch: e.target.value })} aria-label="Phase stretch"
          className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-1 text-[12px]">
          <option value="all">All stretches</option>
          {PHASES.stretches.map((n) => <option key={n} value={n}>{n.replace("-", " → ")}</option>)}
        </select>
      </label>

      {shown.map((name) => {
        const clusters = PHASES.average_paths.features
          .filter((f) => f.properties?.method === method && f.properties?.stretch === name)
          .sort((a, b) => a.properties!.cluster - b.properties!.cluster);
        const splits = PHASES.splits.filter((x) => x.method === method && x.from_stretch === name);
        const sil = clusters[0]?.properties?.silhouette;
        return (
          <section key={name} className="frame p-2.5" aria-label={`Stretch ${name}`}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <h3 className="display text-[15px]">{name.replace("-", " → ")}</h3>
              {sil != null && <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">silhouette {Number(sil).toFixed(2)} <Help id="silhouette" /></span>}
            </div>
            <ul className="flex flex-col gap-1">
              {clusters.map((f) => {
                const p = f.properties!;
                return (
                  <li key={p.cluster}>
                    <details className="group rounded-[var(--radius)] border border-transparent hover:border-border">
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-1.5 py-1 text-[12px]">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color(p.cluster) }} aria-hidden />
                        <span className="shrink-0">Cluster {p.cluster}</span>
                        <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                          {p.divisions} div · {p.bearing}° {compass(p.bearing)} · {p.loo_km} km · {Number(p.directness).toFixed(2)}
                        </span>
                        {p.divisions === 1 && <span className="shrink-0 rounded bg-danger/15 px-1 text-[10px] text-danger">outlier</span>}
                        <button onClick={(e) => { e.preventDefault(); focus(f); }} className="ml-auto shrink-0 text-[11px] text-primary hover:underline"
                          aria-label={`Show ${name} cluster ${p.cluster} on the map`}>map</button>
                      </summary>
                      <p className="px-1.5 pb-1.5 text-[11px] leading-relaxed text-muted-foreground">{p.members}</p>
                    </details>
                  </li>
                );
              })}
            </ul>
            {splits.length > 0 && (
              <div className="mt-2 border-t border-border pt-1.5">
                <div className="mb-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">Split off going into the next stretch <Help id="split" /></div>
                <ul className="text-[11px] leading-relaxed">
                  {splits.map((x) => (
                    <li key={x.division}>
                      <b>{x.division}</b>: left cluster {x.from_cluster} (group → {x.group_went_to}, it → {x.division_went_to})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        );
      })}
      <p className="text-[11px] text-muted-foreground">Bearing and length are the start→end line of the cluster's pieces; the last number is directness. Click a cluster for its divisions.</p>
    </div>
  );
}
