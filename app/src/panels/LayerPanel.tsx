import { useState } from "react";
import { ChevronDown, Eye, EyeOff, RotateCcw, Trash2 } from "lucide-react";
import { layersFor, type LayerDef, type LayerStyle } from "@/config/presets";
import { resetStyle, set, setStyle, styleOf, useStore } from "@/state/store";
import { sourceData } from "@/map/syncLayers";
import { colorExpr } from "@/map/expressions";
import { cn } from "@/lib/utils";
import { StyleEditor } from "./StyleEditor";
import { Help } from "@/ui/Help";
import { HELP } from "@/config/help";

export function LayerPanel() {
  const s = useStore();
  const defs = layersFor(s.page, s.showPlan).slice().reverse(); // top of map first
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section aria-label="Layers" className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h2 className="display text-[13px] text-muted-foreground">Layers</h2>
        <button onClick={() => resetStyle()} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground" title="Reset every layer on every page to its preset">
          <RotateCcw size={11} /> Reset all
        </button>
      </div>
      {defs.map((def) => (
        <LayerRow key={def.id} def={def} style={styleOf(s, def.id)} expanded={open === def.id}
          onToggle={() => setOpen(open === def.id ? null : def.id)}
          onChange={(p) => setStyle(def.id, p)} onReset={() => resetStyle(def.id)}
          features={sourceData(s, def.id)?.features ?? []} />
      ))}
      {s.userLayers.map((u) => (
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
        <button onClick={onToggle} className={cn("min-w-0 flex-1 truncate text-left text-[13px]", !style.visible && "text-muted-foreground")} aria-expanded={expanded}>
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
