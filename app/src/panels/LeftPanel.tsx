import { ExternalLink, Map as MapIcon } from "lucide-react";
import forcesImg from "@/assets/forces.webp";
import { HOME, REGIONS, region } from "@/config/regions";
import { CLUSTER_COLORS } from "@/config/presets";
import { goTo, set, useStore } from "@/state/store";
import { FilterDisclosure } from "@/ui/FilterDisclosure";
import { LayerPanel } from "./LayerPanel";

const clusterOptions = [{ id: "all", label: "All clusters" }, ...CLUSTER_COLORS.map((c) => ({ id: String(c.value), label: `Cluster ${c.value}`, swatch: c.color }))];

export function LeftPanel() {
  const page = useStore((s) => s.page);
  return (
    <div className="scroll-thin flex h-full flex-col gap-3 overflow-y-auto p-3">
      {page === "home" ? <HomeIntro /> : <RegionIntro />}
      <LayerPanel />
    </div>
  );
}

function HomeIntro() {
  return (
    <>
      <h1 className="display text-[26px] leading-none text-foreground">{HOME.title}</h1>
      <p className="leading-relaxed text-muted-foreground">{HOME.text}</p>
      <a href={HOME.forcesUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[var(--radius)] border border-border" title="Purdue FORCES initiative">
        <img src={forcesImg} alt="Purdue FORCES initiative: Strategy, Security, Social Systems" className="w-full" />
      </a>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {HOME.credits.map(([name, role]) => (
          <div key={name}><dt className="text-[12px] text-foreground">{name}</dt><dd className="display text-[10px] text-muted-foreground">{role}</dd></div>
        ))}
      </dl>
      <p className="text-[11px] italic text-muted-foreground">{HOME.book}</p>
      <h2 className="display mt-1 text-[13px] text-muted-foreground">Theaters</h2>
      <div className="grid grid-cols-2 gap-2">
        {REGIONS.map((r) => (
          <button key={r.id} onClick={() => goTo(r.id)} className="group overflow-hidden rounded-[var(--radius)] border border-border text-left hover:border-primary">
            <img src={r.thumb} alt="" className="aspect-[4/3] w-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
            <div className="display px-1.5 py-1 text-[12px]">{r.title}</div>
          </button>
        ))}
      </div>
    </>
  );
}

function RegionIntro() {
  const page = useStore((s) => s.page);
  const filters = useStore((s) => s.filters);
  const showPlan = useStore((s) => s.showPlan);
  const r = region(page)!;
  return (
    <>
      <div className="frame overflow-hidden">
        <img src={r.image} alt="" className="h-28 w-full object-cover grayscale-[30%]" />
        <div className="p-2.5">
          <h1 className="display text-[22px] leading-none">{r.title}</h1>
          <div className="mt-1 font-mono text-[11px] text-primary">{r.dates}</div>
          <p className="mt-2 leading-relaxed text-muted-foreground">{r.text}</p>
        </div>
      </div>
      <section aria-label="Cluster filters" className="flex flex-col gap-1.5">
        <h2 className="display text-[13px] text-muted-foreground">Cluster filters</h2>
        <FilterDisclosure id="geo" label="Geometric clustering groups" options={clusterOptions} value={filters.geo === null ? "all" : String(filters.geo)}
          onChange={(v) => set({ filters: { ...filters, geo: v === "all" ? null : Number(v) } })} />
        <FilterDisclosure id="dv" label="Directional vector clustering groups" options={clusterOptions} value={filters.dv === null ? "all" : String(filters.dv)}
          onChange={(v) => set({ filters: { ...filters, dv: v === "all" ? null : Number(v) } })} />
        {filters.chart && (
          <button onClick={() => set({ filters: { ...filters, chart: null } })}
            className="flex items-center justify-between rounded-[var(--radius)] border border-primary/60 bg-primary/10 px-2 py-1 text-[12px]">
            <span>Chart filter: {filters.chart.field} = {filters.chart.value}</span><span aria-hidden>✕</span>
          </button>
        )}
        <p className="text-[11px] text-muted-foreground">Filters apply to division locations, division paths and cluster paths, and to the charts and table.</p>
      </section>
      {page === "frontier" && (
        <label className="flex cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-border bg-background px-2 py-1.5">
          <input type="checkbox" checked={showPlan} onChange={(e) => set({ showPlan: e.target.checked, ...(e.target.checked ? { rightTab: "plan" as const, rightOpen: true } : {}) })} />
          <MapIcon size={14} className="text-primary" />
          <span className="text-[13px]">Plan vs Actual: AGS pre-war milestones</span>
        </label>
      )}
      <a href="https://experience.arcgis.com/experience/ba5e82851a854d8387a89ea37c32a009" target="_blank" rel="noreferrer"
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><ExternalLink size={11} /> Original ArcGIS Experience</a>
    </>
  );
}
