import { useEffect, useMemo } from "react";
import { Crosshair, Focus, X } from "lucide-react";
import { POSTURE_COLORS } from "@/config/presets";
import { unitRecords, unitsOf } from "@/lib/query";
import { fmtShort } from "@/lib/dates";
import { mapRef } from "@/map/MapView";
import { get, set, unitLabel, useStore } from "@/state/store";
import { TreeMenu, type MenuItem } from "@/ui/TreeMenu";

/** Order of battle tree (Nation → Branch → Unit) and the selected unit's track and posture history. */
export function Oob() {
  const page = useStore((s) => s.page);
  const data = useStore((s) => s.data);
  const unit = useStore((s) => s.unit);
  const follow = useStore((s) => s.follow);
  const date = useStore((s) => s.date);

  const units = useMemo(() => (page === "home" ? [] : unitsOf(get(), page)), [page, data]);
  const tree = useMemo<MenuItem[]>(() => {
    const byNation = new Map<string, Map<string, MenuItem[]>>();
    for (const u of units) {
      const n = byNation.get(u.nation) ?? new Map();
      byNation.set(u.nation, n);
      n.set(u.branch, [...(n.get(u.branch) ?? []), { id: u.key, label: `${u.num === 9999 ? "(unnumbered)" : u.num} ${u.unitType}`, badge: `${u.days}d` }]);
    }
    return [...byNation].map(([nation, b]) => ({
      id: nation, label: nation, badge: [...b.values()].flat().length,
      children: [...b].map(([branch, items]) => ({ id: `${nation}-${branch}`, label: branch, badge: items.length, children: items })),
    }));
  }, [units]);

  const records = useMemo(() => (unit && page !== "home" ? unitRecords(get(), page, unit) : []), [unit, page, data]);
  const today = records.find((f) => f.properties?.Date === date);

  // Follow: keep the map centered on the unit while the timeline plays.
  useEffect(() => {
    if (!follow || !today || !mapRef) return;
    mapRef.easeTo({ center: (today.geometry as GeoJSON.Point).coordinates as [number, number], duration: 600 });
  }, [follow, today]);

  if (page === "home") return <p className="p-4 text-muted-foreground">Open a theater to browse its order of battle.</p>;
  const info = units.find((u) => u.key === unit);

  return (
    <div className="flex flex-col gap-3">
      {info && (
        <div className="frame p-2.5">
          <div className="flex items-start justify-between">
            <div>
              <div className="display text-[11px] text-primary">Tracking</div>
              <h3 className="display text-[18px] leading-tight">{unitLabel(info.key, info.branch)} {info.unitType}</h3>
              <div className="font-mono text-[11px] text-muted-foreground">{fmtShort(info.first)} → {fmtShort(info.last)} · {records.length} records</div>
            </div>
            <button aria-label="Stop tracking" onClick={() => set({ unit: null, follow: false })} className="text-muted-foreground hover:text-foreground"><X size={15} /></button>
          </div>
          <div className="mt-2 flex h-4 overflow-hidden rounded-sm" aria-label="Posture by day">
            {records.map((f, i) => {
              const p = f.properties!;
              return <span key={i} title={`${p.Date}: ${p.Posture}`} className="flex-1 border-r border-card last:border-0"
                style={{ background: POSTURE_COLORS[p.Posture] ?? "#777", outline: p.Date === date ? "2px solid var(--foreground)" : undefined, outlineOffset: -2 }} />;
            })}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
            {Object.entries(POSTURE_COLORS).map(([k, c]) => <span key={k} className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm" style={{ background: c }} />{k}</span>)}
          </div>
          <div className="mt-2 flex gap-2">
            <button onClick={() => set({ follow: !follow })} aria-pressed={follow}
              className={`flex items-center gap-1 rounded-[var(--radius)] border px-2 py-1 text-[12px] ${follow ? "border-primary bg-primary/20" : "border-border hover:bg-muted"}`}>
              <Crosshair size={12} /> {follow ? "Following" : "Follow on map"}
            </button>
            <button onClick={() => zoomTo(records)} className="flex items-center gap-1 rounded-[var(--radius)] border border-border px-2 py-1 text-[12px] hover:bg-muted">
              <Focus size={12} /> Zoom to track
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">{today ? `On ${fmtShort(date)}: ${today.properties?.Posture}, strength ${today.properties?.Frac_Unit}` : `Not recorded on ${fmtShort(date)}.`}</p>
        </div>
      )}
      <TreeMenu data={tree} activeId={unit} onSelect={(it) => { set({ unit: it.id }); zoomTo(unitRecords(get(), page, it.id)); }} />
    </div>
  );
}

function zoomTo(records: GeoJSON.Feature[]) {
  const c = records.map((f) => (f.geometry as GeoJSON.Point).coordinates);
  if (!mapRef || !c.length) return;
  const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
  mapRef.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 90, maxZoom: 8, duration: 900 });
}
