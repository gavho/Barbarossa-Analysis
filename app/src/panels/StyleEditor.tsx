import { useMemo } from "react";
import { RotateCcw } from "lucide-react";
import type { Feature } from "geojson";
import type { Category, LayerDef, LayerStyle } from "@/config/presets";
import { BRANCH_COLORS, CLUSTER_COLORS, SPEED_RAMP } from "@/config/presets";
import { Segmented } from "@/ui/Segmented";

const PALETTE = ["#e5484d", "#3e8ed0", "#46a758", "#ffb224", "#8e4ec6", "#12a594", "#f76b15", "#d6409f", "#978365", "#8d8d8d"];
const KNOWN: Record<string, Category[]> = { Branch_Type: BRANCH_COLORS, Branch: BRANCH_COLORS, Cluster_ID: CLUSTER_COLORS,
  Geo_ClusterID: CLUSTER_COLORS, DV_ClusterID: CLUSTER_COLORS };

/** Distinct values and numeric range of each field, for building categories and ramps. */
function profile(features: Feature[], fields: string[]) {
  const out: Record<string, { values: (string | number)[]; numeric: boolean; min: number; max: number }> = {};
  for (const f of fields) {
    const vals = new Set<string | number>();
    let min = Infinity, max = -Infinity, numeric = true;
    for (const ft of features) {
      const v = ft.properties?.[f];
      if (v === null || v === undefined) continue;
      if (vals.size < 60) vals.add(v);
      if (typeof v === "number") { min = Math.min(min, v); max = Math.max(max, v); } else numeric = false;
    }
    out[f] = { values: [...vals].sort((a, b) => (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b)))), numeric: numeric && min <= max, min, max };
  }
  return out;
}

export function StyleEditor({ def, style, features, onChange, onReset }: {
  def: LayerDef;
  style: LayerStyle;
  features: Feature[];
  onChange: (p: Partial<LayerStyle>) => void;
  onReset: () => void;
}) {
  const prof = useMemo(() => profile(features, def.fields), [features, def.fields]);
  const numericFields = def.fields.filter((f) => prof[f]?.numeric);
  const catFields = def.fields.filter((f) => (prof[f]?.values.length ?? 0) > 0 && (prof[f]?.values.length ?? 99) <= 40);

  const setCategoryField = (field: string) => {
    const known = KNOWN[field];
    const categories = prof[field].values.map((v, i) => ({ value: v, color: known?.find((k) => k.value === v)?.color ?? PALETTE[i % PALETTE.length] }));
    onChange({ colorMode: "category", colorField: field, categories });
  };
  const setRampField = (field: string) => {
    const { min, max } = prof[field];
    const ramp = SPEED_RAMP.map(([, c], i) => [round(min + ((max - min) * i) / (SPEED_RAMP.length - 1)), c] as [number, string]);
    onChange({ colorMode: "ramp", colorField: field, ramp });
  };

  if (def.kind === "heatmap") {
    return (
      <Editor onReset={onReset}>
        <Row label="Radius"><Range min={5} max={60} value={style.heatRadius ?? 30} onChange={(v) => onChange({ heatRadius: v })} /></Row>
        <p className="text-[11px] text-muted-foreground">Weighted by unit strength (Frac_Unit).</p>
      </Editor>
    );
  }

  return (
    <Editor onReset={onReset}>
      <Row label="Color">
        <Segmented size="sm" value={style.colorMode} onChange={(m) => {
          if (m === "single") onChange({ colorMode: "single" });
          else if (m === "category") setCategoryField(style.colorMode === "category" && style.colorField ? style.colorField : catFields[0]);
          else if (numericFields.length) setRampField(style.colorMode === "ramp" && style.colorField ? style.colorField : numericFields[0]);
        }} items={[{ value: "single", label: "Single" }, { value: "category", label: "Category" },
          ...(numericFields.length ? [{ value: "ramp" as const, label: "Ramp" }] : [])]} />
      </Row>

      {style.colorMode === "single" && (
        <Row label="Fill"><input type="color" aria-label="Color" value={toHex(style.color)} onChange={(e) => onChange({ color: e.target.value })} className="h-6 w-10 cursor-pointer rounded border border-border bg-transparent" /></Row>
      )}

      {style.colorMode === "category" && (
        <>
          <Row label="Field"><FieldSelect fields={catFields} value={style.colorField} onChange={setCategoryField} /></Row>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            {style.categories?.map((c, i) => (
              <label key={String(c.value)} className="flex items-center gap-1.5 text-[12px]">
                <input type="color" value={toHex(c.color)} aria-label={`Color for ${c.value}`}
                  onChange={(e) => onChange({ categories: style.categories!.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)) })}
                  className="h-5 w-6 shrink-0 cursor-pointer rounded border border-border bg-transparent" />
                <span className="truncate">{String(c.value)}</span>
              </label>
            ))}
          </div>
          <Row label="Other"><input type="color" aria-label="Color for other values" value={toHex(style.color)} onChange={(e) => onChange({ color: e.target.value })} className="h-5 w-6 cursor-pointer rounded border border-border bg-transparent" /></Row>
        </>
      )}

      {style.colorMode === "ramp" && (
        <>
          <Row label="Field"><FieldSelect fields={numericFields} value={style.colorField} onChange={setRampField} /></Row>
          <div className="flex flex-col gap-1">
            {style.ramp?.map(([v, c], i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input type="color" value={toHex(c)} aria-label={`Ramp color ${i + 1}`}
                  onChange={(e) => onChange({ ramp: style.ramp!.map((s, j) => (j === i ? [s[0], e.target.value] : s)) })}
                  className="h-5 w-6 cursor-pointer rounded border border-border bg-transparent" />
                <input type="number" value={v} aria-label={`Ramp value ${i + 1}`}
                  onChange={(e) => onChange({ ramp: style.ramp!.map((s, j) => (j === i ? [Number(e.target.value), s[1]] : s)) })}
                  className="w-20 rounded border border-border bg-background px-1 font-mono text-[11px]" />
              </div>
            ))}
          </div>
        </>
      )}

      {(def.kind === "circle" || def.kind === "line") && (
        <>
          <Row label={def.kind === "circle" ? "Size by" : "Width by"}>
            <FieldSelect fields={numericFields} value={style.sizeField} allowNone onChange={(f) => {
              if (!f) return onChange({ sizeField: undefined, size: [style.size[0], style.size[0]] });
              const p = prof[f];
              onChange({ sizeField: f, sizeDomain: [p.min, p.max], size: [style.size[0], Math.max(style.size[1], style.size[0] * 3)] });
            }} />
          </Row>
          <Row label={style.sizeField ? "Min · Max" : "Size"}>
            <div className="flex items-center gap-1">
              <Range min={0.5} max={20} step={0.5} value={style.size[0]} onChange={(v) => onChange({ size: [v, style.sizeField ? Math.max(v, style.size[1]) : v] })} />
              {style.sizeField && <Range min={0.5} max={30} step={0.5} value={style.size[1]} onChange={(v) => onChange({ size: [Math.min(style.size[0], v), v] })} />}
            </div>
          </Row>
        </>
      )}
      {def.kind === "line" && (
        <label className="flex items-center gap-2 text-[12px]">
          <input type="checkbox" checked={!!style.dash} onChange={(e) => onChange({ dash: e.target.checked })} /> Dashed
          {["dv", "geo", "plan_phase", "areas"].includes(def.id) && (
            <><input type="checkbox" className="ml-3" checked={style.labels !== false && (!!style.labels || def.id === "areas")} onChange={(e) => onChange({ labels: e.target.checked })} /> Labels</>
          )}
        </label>
      )}
    </Editor>
  );
}

const round = (n: number) => Math.round(n * 10) / 10;
const toHex = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#888888");

function Editor({ children, onReset }: { children: React.ReactNode; onReset: () => void }) {
  return (
    <div className="mt-1.5 flex flex-col gap-2 border-l-2 border-primary/40 py-1 pl-2.5">
      {children}
      <button onClick={onReset} className="flex items-center gap-1 self-start text-[11px] text-muted-foreground hover:text-foreground">
        <RotateCcw size={11} /> Reset to preset
      </button>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="display shrink-0 text-[11px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function FieldSelect({ fields, value, onChange, allowNone }: { fields: string[]; value?: string; onChange: (f: string) => void; allowNone?: boolean }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} aria-label="Field"
      className="min-w-0 max-w-[160px] rounded border border-border bg-background px-1 py-0.5 text-[12px]">
      {allowNone && <option value="">— none —</option>}
      {fields.map((f) => <option key={f} value={f}>{f}</option>)}
    </select>
  );
}

export function Range({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  return (
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
      className="w-20 accent-[var(--primary)]" aria-label="Value" />
  );
}
