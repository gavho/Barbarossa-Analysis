import { Crosshair, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { set, unitKey, useStore } from "@/state/store";

const TITLES: Record<string, (p: Record<string, unknown>) => string> = {
  points: (p) => `${p.Num_Name} ${p.Branch_Type ?? ""} ${p.Unit_Type ?? ""}`,
  dvvec: (p) => `DV cluster ${p.Cluster_ID}: ${p.Vectors} vector(s)`,
  geovec: (p) => `Geometric cluster ${p.Cluster_ID}: ${p.Vectors} vector(s)`,
  paths: (p) => `${p.Nation} ${p.Num_Name} ${p.Branch ?? ""} · ${p.Start_Date} → ${p.End_Date}`,
  dv: (p) => `DV cluster ${p.Cluster_ID} · day ${p.Day_Index}`,
  geo: (p) => `Geometric cluster ${p.Cluster_ID} · day ${p.Day_Index}`,
  plan_phase: (p) => `Line ${String(p.line_id).toUpperCase()}: ${p.name}`,
  plan_advance: (p) => `Line of advance: ${p.unit}`,
  plan_pocket: (p) => `Small-pocket COA: ${p.unit}`,
};

export function FeatureInfo() {
  const sel = useStore((s) => s.selection);
  return (
    <AnimatePresence mode="popLayout">
      {!sel ? (
        <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 text-center text-muted-foreground">
          Click a feature on the map or a row in the table to see its details.
        </motion.p>
      ) : (
        <motion.div key={JSON.stringify(sel.props)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="frame p-3">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <div className="display text-[11px] text-primary">{sel.title}</div>
              <h3 className="display text-[18px] leading-tight">{TITLES[sel.layer]?.(sel.props) ?? sel.title}</h3>
            </div>
            <button aria-label="Clear selection" onClick={() => set({ selection: null })} className="text-muted-foreground hover:text-foreground"><X size={15} /></button>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {Object.entries(sel.props).filter(([, v]) => v !== null && v !== "").map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-[11px] text-muted-foreground">{k.replace(/_/g, " ")}</dt>
                <dd className="font-mono text-[12px] break-words">{typeof v === "number" && !Number.isInteger(v) ? v.toFixed(2) : String(v)}</dd>
              </div>
            ))}
          </dl>
          {(sel.layer === "points" || sel.layer === "paths") && (
            <button onClick={() => set({ unit: unitKey(sel.props.Nation, sel.props.Num_Name), rightTab: "oob" })}
              className="mt-3 flex items-center gap-1.5 rounded-[var(--radius)] border border-primary/60 bg-primary/10 px-2 py-1 text-[12px] hover:bg-primary/20">
              <Crosshair size={13} /> Track this unit
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
