import { useState } from "react";
import { ChevronDown, Eye, EyeOff, FolderOpen, Layers, Map as MapIcon, Milestone, Network, Route, RotateCcw, Trash2 } from "lucide-react";
import { groupOf, layersFor, type LayerDef, type LayerStyle } from "@/config/presets";
import type { RegionId } from "@/config/regions";
import { FluidTabs, type TabItem } from "@/ui/FluidTabs";
import { ClusterFilters, ClusterSettings } from "./ClusterSettings";
import { resetStyle, set, setStyle, styleOf, useStore } from "@/state/store";
import { sourceData } from "@/map/syncLayers";
import { colorExpr } from "@/map/expressions";
import { cn } from "@/lib/utils";
import { StyleEditor } from "./StyleEditor";
import { Help } from "@/ui/Help";
import { HELP } from "@/config/help";

type Tab = "units" | "clusters" | "phases" | "plan" | "mine";
const TABS: TabItem<Tab>[] = [
  { id: "units", label: "Units", icon: <Layers size={14} /> },
  { id: "clusters", label: "Clusters", icon: <Network size={14} /> },
  { id: "phases", label: "Phases", icon: <Milestone size={14} /> },
  { id: "plan", label: "Plan", icon: <Route size={14} /> },
  { id: "mine", label: "Mine", icon: <FolderOpen size={14} /> },
];

export function LayerPanel() {
  const s = useStore();
  const all = layersFor(s.page, s.showPlan).slice().reverse(); // top of map first
  const [open, setOpen] = useState<string | null>(null);
  // A tab shows when it has something in it: its layers, the cluster tools on a theatre, the plan toggle on Frontier.
  const tabs = TABS.filter((t) => t.id === "mine" ? s.userLayers.length > 0
    : (t.id === "clusters" && s.page !== "home") || (t.id === "plan" && s.page === "frontier") || all.some((d) => groupOf(d.id) === t.id));
  const tab = (tabs.find((t) => t.id === s.layerTab) ?? tabs[0]).id;
  const defs = all.filter((d) => groupOf(d.id) === tab);
  const region = s.page === "home" ? null : (s.page as RegionId);

  return (
    <section aria-label="Layers" className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h2 className="display text-[13px] text-muted-foreground">Layers</h2>
        <button onClick={() => resetStyle()} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground" title="Reset every layer on every page to its preset">
          <RotateCcw size={11} /> Reset all
        </button>
      </div>
      {tabs.length > 1 && <FluidTabs tabs={tabs} active={tab} onChange={(t) => set({ layerTab: t })} layoutId="layer-tab-pill" />}
      {tab === "clusters" && region && <><ClusterSettings region={region} /><ClusterFilters region={region} /></>}
      {tab === "plan" && s.page === "frontier" && (
        <label className="flex cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-border bg-background px-2 py-1.5">
          <input type="checkbox" checked={s.showPlan} onChange={(e) => set({ showPlan: e.target.checked, ...(e.target.checked ? { rightTab: "plan" as const, rightOpen: true } : {}) })} />
          <MapIcon size={14} className="text-primary" />
          <span className="text-[13px]">Plan vs Actual: AGS pre-war milestones</span>
        </label>
      )}
      {defs.map((def) => (
        <LayerRow key={def.id} def={def} style={styleOf(s, def.id)} expanded={open === def.id}
          onToggle={() => setOpen(open === def.id ? null : def.id)}
          onChange={(p) => setStyle(def.id, p)} onReset={() => resetStyle(def.id)}
          features={sourceData(s, def.id)?.features ?? []} />
      ))}
      {tab === "mine" && s.userLayers.map((u) => (
        <LayerRow key={u.id} def={{ id: `user-${u.id}` as never, title: u.name, kind: u.kind, time: "none", cluster: "none", fields: Object.keys(u.data.features[0]?.properties ?? {}) }}
          style={u.style} expanded={open === u.id} onToggle={() => setOpen(open === u.id ? null : u.id)}
          onChange={(p) => set({ userLayers: s.userLayers.map((x) => (x.id === u.id ? { ...x, style: { ...x.style, ...p } } : x)) })}
          onReset={() => {}} features={u.data.features}
          onRemove={() => set({ userLayers: s.userLayers.filter((x) => x.id !== u.id) })} />
      ))}
    </section>
  );
}

function LayerRow({ def, style, expanded, onToggle, onChange, onReset, features, onRemove }: {
  def: LayerDef; style: LayerStyle; expanded: boolean; onToggle: () => void;
  onChange: (p: Partial<LayerStyle>) => void; onReset: () => void; features: GeoJSON.Feature[]; onRemove?: () => void;
}) {
  return (
    <div className={cn("rounded-[var(--radius)] border px-2 py-1.5 transition-colors", expanded ? "border-primary/50 bg-background" : "border-transparent hover:border-border")}>
      <div className="flex items-center gap-2">
        <button aria-label={style.visible ? `Hide ${def.title}` : `Show ${def.title}`} onClick={() => onChange({ visible: !style.visible })}
          className={style.visible ? "text-foreground" : "text-muted-foreground"}>
          {style.visible ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>
        <Swatch def={def} style={style} />
        <button onClick={onToggle} className={cn("min-w-0 flex-1 text-left text-[13px] leading-snug [overflow-wrap:anywhere]", !style.visible && "text-muted-foreground")} aria-expanded={expanded}>
          {def.title}
        </button>
        {HELP[def.id.endsWith("vec") ? "vectors" : def.id] && <Help id={def.id.endsWith("vec") ? "vectors" : def.id} />}
        <input type="range" min={0} max={1} step={0.05} value={style.opacity} aria-label={`${def.title} opacity`}
          onChange={(e) => onChange({ opacity: Number(e.target.value) })} className="w-14 accent-[var(--primary)]" />
        {onRemove && <button aria-label={`Remove ${def.title}`} onClick={onRemove} className="text-muted-foreground hover:text-danger"><Trash2 size={13} /></button>}
        <button aria-label="Edit style" onClick={onToggle} className="text-muted-foreground hover:text-foreground">
          <ChevronDown size={14} className={cn("transition-transform", expanded && "rotate-180")} />
        </button>
      </div>
      {expanded && <StyleEditor def={def} style={style} features={features} onChange={onChange} onReset={onReset} />}
    </div>
  );
}

/** Small legend glyph: category colors as a strip, ramps as a gradient. */
export function Swatch({ def, style }: { def: LayerDef; style: LayerStyle }) {
  const bg =
    def.kind === "heatmap" ? "linear-gradient(90deg,#0022c8,#7a1fa2,#ff7a00,#ffef3a)"
      : style.colorMode === "ramp" && style.ramp ? `linear-gradient(90deg,${style.ramp.map((r) => r[1]).join(",")})`
      : style.colorMode === "category" && style.categories ? `linear-gradient(90deg,${style.categories.slice(0, 6).map((c, i, a) => `${c.color} ${(i / a.length) * 100}% ${((i + 1) / a.length) * 100}%`).join(",")})`
      : (colorExpr(style) as string);
  return <span aria-hidden className={cn("h-3 w-5 shrink-0 border border-black/20", def.kind === "circle" ? "rounded-full" : def.kind === "line" ? "h-1.5 rounded-sm" : "rounded-sm")} style={{ background: bg }} />;
}
