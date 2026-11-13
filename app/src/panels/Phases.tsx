import { Eye, EyeOff } from "lucide-react";
import type { Feature, LineString } from "geojson";
import { PHASES } from "@/data";
import { CLUSTER_COLORS } from "@/config/presets";
import { mapRef } from "@/map/MapView";
import { set, setStyle, showDefaults, showOnly, styleOf, useStore, type State } from "@/state/store";
import { Help } from "@/ui/Help";
import { Segmented } from "@/ui/Segmented";
import { cn } from "@/lib/utils";
import { compass } from "./Vectors";
import { FrontProfile, PlacesInLine } from "./AlongFront";
import { NaturalBreaks } from "./NaturalBreaks";
import { LineEditor } from "./LineEditor";
import { Diversity } from "./Diversity";

export const color = (cid: number) => CLUSTER_COLORS.find((c) => c.value === cid)?.color ?? "#888";
export const Swatch = ({ cid }: { cid: number }) => (
  <span className="inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: color(cid) }} aria-label={`group ${cid}`} />
);
export const separation = (sil: number) => (sil >= 0.5 ? "groups clearly separate" : sil >= 0.25 ? "groups fairly separate" : "groups overlap");

type Section = State["phaseSection"];

/** The phase-line analyses, one at a time, each owning the map: natural breaks on each planned date, and the
 * earlier between-the-lines charts kept as a method check. Groupings of divisions live in the Groups tab. */
export function Phases() {
  const section = useStore((s) => s.phaseSection);
  const open = (v: Section) => {
    if (v !== section) showDefaults();
    set({ phaseSection: v, drawing: null });
  };
  return (
    <div className="flex flex-col gap-2.5">
      <Segmented<Section> size="sm" value={section} onChange={open}
        items={[{ value: "breaks", label: "Natural breaks" }, { value: "diversity", label: "Diversity" }, { value: "lines", label: "Edit lines" }, { value: "method", label: "Method check" }]} />
      {section === "breaks" && <NaturalBreaks />}
      {section === "diversity" && <Diversity />}
      {section === "lines" && <LineEditor />}
      {section === "method" && (
        <div className="flex flex-col gap-2.5">
          <FrontProfile />
          <PlacesInLine />
          <BetweenLines />
        </div>
      )}
    </div>
  );
}

/** Clusters re-fitted within each stretch between AGS phase lines, and the divisions that split off between stretches. */
function BetweenLines() {
  const s = useStore();
  const { method, stretch } = s.phase;
  const visible = styleOf(s, "phaseavg").visible;
  const shown = stretch === "all" ? PHASES.stretches : [stretch];
  const setPhase = (p: Partial<typeof s.phase>) => set({ phase: { ...s.phase, ...p } });
  const toggleMap = () => (visible ? setStyle("phaseavg", { visible: false }) : showOnly(["phaseavg"])); // division pieces stay in the layer list: drawn by default they bury the group paths

  const focus = (f: Feature) => {
    if (!visible) toggleMap();
    set({ selection: { layer: "phaseavg", title: "Phase · Group Paths", props: { ...f.properties } } });
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
              {sil != null && <span className="flex items-center gap-1 text-[11px] text-muted-foreground" title={`silhouette ${Number(sil).toFixed(2)}`}>{separation(sil)} <Help id="silhouette" /></span>}
            </div>
            <ul className="flex flex-col gap-1">
              {clusters.map((f) => {
                const p = f.properties!;
                return (
                  <li key={p.cluster}>
                    <details className="group rounded-[var(--radius)] border border-transparent hover:border-border">
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-1.5 py-1 text-[12px]">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color(p.cluster) }} aria-hidden />
                        <span className="min-w-0 truncate">
                          {p.divisions === 1 ? "1 division on its own" : `${p.divisions} divisions`}, heading {compass(p.bearing)}, {p.loo_km} km
                        </span>
                        <button onClick={(e) => { e.preventDefault(); focus(f); }} className="ml-auto shrink-0 text-[11px] text-primary hover:underline"
                          aria-label={`Show ${name} group ${p.cluster} on the map`}>map</button>
                      </summary>
                      <p className="px-1.5 pb-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        {p.members}. <span className="font-mono">Bearing {p.bearing}°, directness {Number(p.directness).toFixed(2)}.</span>
                      </p>
                    </details>
                  </li>
                );
              })}
            </ul>
            {splits.length > 0 && (
              <div className="mt-2 border-t border-border pt-1.5">
                <div className="mb-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">Broke away from their group at the next phase line <Help id="split" /></div>
                <ul className="text-[11px] leading-relaxed">
                  {splits.map((x) => (
                    <li key={x.division}>
                      <b>{x.division}</b> left <Swatch cid={x.from_cluster} /> and went with <Swatch cid={x.division_went_to} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        );
      })}
      <p className="text-[11px] text-muted-foreground">A colour is one group of divisions, followed from one stretch to the next. Click a group for its divisions; "map" zooms to it.</p>
    </div>
  );
}
