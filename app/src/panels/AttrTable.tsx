import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, FileJson, FileSpreadsheet } from "lucide-react";
import type { Feature } from "geojson";
import { layersFor, type LayerId } from "@/config/presets";
import { visibleFeatures } from "@/lib/query";
import { exportLayer } from "@/io/export";
import { mapRef } from "@/map/MapView";
import { set, useStore } from "@/state/store";
import { cn } from "@/lib/utils";

const ROW = 26;

export function AttrTable() {
  const s = useStore();
  const defs = layersFor(s.page, s.showPlan).filter((d) => d.kind !== "heatmap");
  const id: LayerId = defs.some((d) => d.id === s.tableLayer) ? s.tableLayer : defs[defs.length - 1].id;
  const def = defs.find((d) => d.id === id)!;
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [scroll, setScroll] = useState(0);
  const [height, setHeight] = useState(400);

  const bounds = s.tableExtentOnly && mapRef ? (mapRef.getBounds().toArray().flat() as [number, number, number, number]) : undefined;
  const rows = useMemo(() => {
    const feats = visibleFeatures(s, id, bounds);
    if (!sort) return feats;
    return [...feats].sort((a, b) => cmp(a.properties?.[sort.col], b.properties?.[sort.col]) * sort.dir);
    // view is a dependency so "map extent only" refreshes after panning
  }, [s.page, s.mode, s.date, s.filters, s.data, id, sort, s.tableExtentOnly, s.tableExtentOnly ? s.view : null]);

  const first = Math.max(0, Math.floor(scroll / ROW) - 5);
  const visible = rows.slice(first, first + Math.ceil(height / ROW) + 10);
  const cols = def.fields;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select value={id} onChange={(e) => set({ tableLayer: e.target.value as LayerId })} aria-label="Table layer"
          className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-1 text-[12px]">
          {defs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
        </select>
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <input type="checkbox" checked={s.tableExtentOnly} onChange={(e) => set({ tableExtentOnly: e.target.checked })} /> Map extent
        </label>
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="font-mono">{rows.length.toLocaleString()} rows</span>
        <span className="flex gap-2">
          <button onClick={() => exportLayer(id, "geojson")} className="flex items-center gap-1 hover:text-foreground"><FileJson size={12} /> GeoJSON</button>
          <button onClick={() => exportLayer(id, "csv")} className="flex items-center gap-1 hover:text-foreground"><FileSpreadsheet size={12} /> CSV</button>
        </span>
      </div>
      <div className="scroll-thin relative min-h-0 flex-1 overflow-auto rounded-[var(--radius)] border border-border bg-background"
        ref={(el) => { if (el && el.clientHeight !== height) setHeight(el.clientHeight); }}
        onScroll={(e) => setScroll(e.currentTarget.scrollTop)}>
        <table className="w-max min-w-full border-collapse text-[12px]">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              {cols.map((c) => (
                <th key={c} className="cursor-pointer whitespace-nowrap border-b border-border px-2 py-1 text-left font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setSort(sort?.col === c ? (sort.dir === 1 ? { col: c, dir: -1 } : null) : { col: c, dir: 1 })}
                  aria-sort={sort?.col === c ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
                  <span className="inline-flex items-center gap-1">{c}{sort?.col === c && (sort.dir === 1 ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {first > 0 && <tr style={{ height: first * ROW }} />}
            {visible.map((f, i) => (
              <tr key={first + i} onClick={() => focus(f, def.title, id)}
                className={cn("cursor-pointer hover:bg-accent", (first + i) % 2 && "bg-muted/40")} style={{ height: ROW }}>
                {cols.map((c) => <td key={c} className="whitespace-nowrap px-2 font-mono text-[11px]">{fmt(f.properties?.[c])}</td>)}
              </tr>
            ))}
            {rows.length > first + visible.length && <tr style={{ height: (rows.length - first - visible.length) * ROW }} />}
          </tbody>
        </table>
        {!rows.length && <p className="p-4 text-center text-muted-foreground">No features for the current date and filters.</p>}
      </div>
    </div>
  );
}

function focus(f: Feature, title: string, layer: string) {
  set({ selection: { layer, title, props: { ...f.properties } }, rightTab: "info" });
  const coords: number[][] = [];
  const walk = (c: unknown) => (typeof (c as number[])[0] === "number" ? coords.push(c as number[]) : (c as unknown[]).forEach(walk));
  walk((f.geometry as { coordinates: unknown }).coordinates);
  if (!mapRef || !coords.length) return;
  const xs = coords.map((c) => c[0]), ys = coords.map((c) => c[1]);
  if (coords.length === 1) mapRef.flyTo({ center: [xs[0], ys[0]], zoom: Math.max(mapRef.getZoom(), 8) });
  else mapRef.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 80, maxZoom: 9 });
}

const cmp = (a: unknown, b: unknown) => (a === b ? 0 : a === null || a === undefined ? 1 : b === null || b === undefined ? -1 : a < b ? -1 : 1);
const fmt = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(2)) : String(v));
