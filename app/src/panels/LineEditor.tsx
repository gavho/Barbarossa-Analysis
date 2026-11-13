import { useState } from "react";
import { Pencil, RotateCcw, Undo2 } from "lucide-react";
import { MILESTONES, PLAN_MATCH } from "@/data";
import { TOWNS, parseTowns } from "@/config/towns";
import { lineId, setLine, townNames } from "@/state/lines";
import { set, useStore, type LineKind } from "@/state/store";
import { Help } from "@/ui/Help";
import { Segmented } from "@/ui/Segmented";
import { cn } from "@/lib/utils";

const SRC = { phase: MILESTONES.AGS_PhaseLines.features, advance: MILESTONES.AGS_AdvanceLines.features };
const title = (kind: LineKind, p: Record<string, unknown> | null) =>
  kind === "phase" ? `Phase ${p?.line_id} · ${p?.name}` : `${p?.unit} · ${PLAN_MATCH.planned_names[String(p?.unit)] ?? ""}`;
const btn = "flex items-center gap-1 rounded-[var(--radius)] border px-2 py-1 text-[12px] disabled:opacity-40";

/** Redraw a planned phase line or line of advance from a list of towns, or by clicking points on the map. */
export function LineEditor() {
  const [kind, setKind] = useState<LineKind>("phase");
  const [id, setId] = useState(lineId("phase", SRC.phase[0].properties));
  const edit = useStore((s) => s.lineEdits[kind][id]);
  const drawing = useStore((s) => s.drawing);
  const isDrawing = drawing?.kind === kind && drawing.id === id;
  const original = SRC[kind].find((f) => lineId(kind, f.properties) === id)?.properties;
  const named = edit ? townNames(edit) : String(original?.towns ?? "");

  const pick = (k: LineKind, i: string) => { set({ drawing: null }); setKind(k); setId(i); };
  const draw = () => {
    if (isDrawing) return set({ drawing: null });
    setLine(kind, id, []);
    set({ drawing: { kind, id }, showPlan: true });
  };

  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="display flex items-center gap-1.5 text-[15px]">Edit lines <Help id="editLines" /></h3>
      <Segmented<LineKind> size="sm" value={kind} onChange={(k) => pick(k, lineId(k, SRC[k][0].properties))}
        items={[{ value: "phase", label: "Phase lines" }, { value: "advance", label: "Lines of advance" }]} />
      <select value={id} onChange={(e) => pick(kind, e.target.value)} aria-label="Line to edit"
        className="rounded border border-border bg-background px-1 py-1 text-[12px]">
        {SRC[kind].map((f) => <option key={lineId(kind, f.properties)} value={lineId(kind, f.properties)}>{title(kind, f.properties)}</option>)}
      </select>
      <Towns key={`${kind}|${id}|${named}`} initial={named} onApply={(ll) => { set({ drawing: null, showPlan: true }); setLine(kind, id, ll); }} />
      <div className="flex flex-wrap gap-1.5">
        <button onClick={draw} aria-pressed={isDrawing} className={cn(btn, isDrawing ? "border-primary bg-primary/15" : "border-border hover:bg-muted")}>
          <Pencil size={13} /> {isDrawing ? "Done drawing" : "Draw on map"}
        </button>
        <button onClick={() => setLine(kind, id, edit!.slice(0, -1))} disabled={!edit?.length} className={cn(btn, "border-border hover:bg-muted")}>
          <Undo2 size={13} /> Undo point
        </button>
        <button onClick={() => { set({ drawing: null }); setLine(kind, id, null); }} disabled={!edit} className={cn(btn, "border-border hover:bg-muted")}>
          <RotateCcw size={13} /> Original
        </button>
      </div>
      {isDrawing && <p className="text-[11px] text-primary">Click the map from {kind === "phase" ? "one end of the line to the other" : "start to finish"}; clicks within 12 km of a town snap to it.</p>}
      {edit && edit.length < 2 && <p className="text-[11px] text-muted-foreground">Add at least two points; until then the original line is used.</p>}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Redrawn lines are used on the map, in Natural breaks, in the phase-line crossings on the Plan tab and in Planned vs actual.
        The Method check and the Groups tab stay on the original lines (they are computed offline). Redrawn lines are kept in saved workspaces.
      </p>
    </div>
  );
}

function Towns({ initial, onApply }: { initial: string; onApply: (ll: number[][]) => void }) {
  const [text, setText] = useState(initial);
  const { towns, unknown } = parseTowns(text);
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-muted-foreground" htmlFor="line-towns">Towns in order, separated by " - " or commas</label>
      <textarea id="line-towns" value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Lutsk - Rivne - Zhytomyr - Kyiv"
        className="rounded border border-border bg-background px-1.5 py-1 text-[12px]" />
      <div className="flex items-center justify-between gap-2">
        <span className={cn("min-w-0 text-[11px]", unknown.length ? "text-danger" : "text-muted-foreground")}>
          {unknown.length ? `Unknown: ${unknown.join(", ")}` : `${towns.length} towns`}
        </span>
        <button onClick={() => onApply(towns.map((t) => t.ll))} disabled={towns.length < 2 || unknown.length > 0 || text === initial}
          className={cn(btn, "shrink-0 border-border hover:bg-muted")}>Apply towns</button>
      </div>
      <details className="text-[11px] text-muted-foreground">
        <summary className="cursor-pointer">Known towns ({TOWNS.length})</summary>
        <p className="mt-0.5 leading-relaxed">{TOWNS.map((t) => t.name).join(", ")}</p>
      </details>
    </div>
  );
}
