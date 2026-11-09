import { useEffect, useState } from "react";
import { CLUSTER_COLORS } from "@/config/presets";
import type { RegionId } from "@/config/regions";
import { PUBLISHED, RECOMMENDED, type ClusterSettings as Settings } from "@/lib/cluster";
import { divisionName, regionOf, settingsOf } from "@/state/clusters";
import { set, useStore } from "@/state/store";
import { FilterDisclosure } from "@/ui/FilterDisclosure";
import { Help } from "@/ui/Help";
import { Segmented } from "@/ui/Segmented";

const separation = (sil: number) => (sil >= 0.5 ? "clearly separate" : sil >= 0.25 ? "fairly separate" : "overlapping");

/** Change how a theatre's divisions are grouped; every map layer, filter, chart, Vectors card and plan comparison follows. */
export function ClusterSettings({ region }: { region: RegionId }) {
  const s = useStore();
  const st = settingsOf(s, region);
  const info = regionOf(s, region).info;
  const put = (p: Partial<Settings>) => set({ clusters: { ...s.clusters, [region]: { ...st, ...p } }, filters: { ...s.filters, dv: null, geo: null } });
  const choose = (preset: Settings["preset"]) => put(preset === "published" ? PUBLISHED : preset === "recommended" ? RECOMMENDED : { ...st, preset });

  // Sliders show their value while dragging and re-cluster on release (each re-clustering takes up to ~0.5 s).
  const [draft, setDraft] = useState(st);
  useEffect(() => setDraft(st), [st]);
  const commit = () => { if (draft.dvK !== st.dvK || draft.geoK !== st.geoK || draft.minMoveKm !== st.minMoveKm) put({ ...draft, preset: "custom" }); };
  const slider = (label: string, key: "dvK" | "geoK" | "minMoveKm", min: number, max: number, step: number, unit = "") => (
    <label className="grid grid-cols-[1fr_auto] items-center gap-x-2 text-[12px]">
      <span>{label}</span><b className="font-mono text-[12px]">{draft[key]}{unit}</b>
      <input type="range" min={min} max={max} step={step} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit} className="col-span-2 accent-[var(--primary)]" aria-label={label} />
    </label>
  );

  return (
    <section className="frame flex flex-col gap-2 p-2.5" aria-label="Cluster settings">
      <h3 className="display flex items-center gap-1.5 text-[13px]">Cluster settings <Help id="clusterSettings" /></h3>
      <Segmented<Settings["preset"]> size="sm" value={st.preset} onChange={choose}
        items={[{ value: "published", label: "Published" }, { value: "recommended", label: "One per line" }, { value: "custom", label: "Custom" }]} />
      {st.preset === "published" ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">The clusters in the paper: 5 per method, every division included.</p>
      ) : (
        <>
          {slider("Directional-vector groups", "dvK", 2, 8, 1)}
          {slider("Geometric groups", "geoK", 2, 8, 1)}
          {slider("Set aside units that moved under", "minMoveKm", 0, 300, 10, " km")}
          {info && (
            <div className="text-[11px] leading-relaxed text-muted-foreground">
              {(["dv", "geo"] as const).map((m) => (
                <div key={m}>{m === "dv" ? "Directional vector" : "Geometric"}: groups of {info[m].sizes.join(" / ")} · {separation(info[m].silhouette)}
                  <span className="font-mono"> ({info[m].silhouette.toFixed(2)})</span></div>
              ))}
              {info.stayedBehind.length > 0 && <div className="mt-1">Set aside ({info.stayedBehind.length}): {info.stayedBehind.map(divisionName).join(", ")}</div>}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** The two cluster filters, with as many options as the active settings give groups. */
export function ClusterFilters({ region }: { region: RegionId }) {
  const s = useStore();
  const info = regionOf(s, region).info;
  const options = (k: number) => [{ id: "all", label: "All clusters" }, ...CLUSTER_COLORS.slice(0, k).map((c) => ({ id: String(c.value), label: `Cluster ${c.value}`, swatch: c.color }))];
  return (
    <section aria-label="Cluster filters" className="flex flex-col gap-1.5">
      <h2 className="display flex items-center gap-1.5 text-[13px] text-muted-foreground">Cluster filters <Help id="clusterFilters" /></h2>
      <FilterDisclosure id="geo" label="Geometric clustering groups" options={options(info?.geo.k ?? 5)} value={s.filters.geo === null ? "all" : String(s.filters.geo)}
        onChange={(v) => set({ filters: { ...s.filters, geo: v === "all" ? null : Number(v) } })} />
      <FilterDisclosure id="dv" label="Directional vector clustering groups" options={options(info?.dv.k ?? 5)} value={s.filters.dv === null ? "all" : String(s.filters.dv)}
        onChange={(v) => set({ filters: { ...s.filters, dv: v === "all" ? null : Number(v) } })} />
      <p className="text-[11px] text-muted-foreground">Filters apply to division locations, division paths and cluster paths, and to the charts and table.</p>
    </section>
  );
}
