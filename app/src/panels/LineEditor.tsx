import { useState } from "react";
import { ChevronLeft, ChevronRight, Eraser, Pencil, RotateCcw, X } from "lucide-react";
import type { LineString } from "geojson";
import { MILESTONES, PLAN_MATCH } from "@/data";
import { TOWNS, parseTowns, snapTown } from "@/config/towns";
import { lineId, setLine, townNames } from "@/state/lines";
import { set, useStore, type LineKind } from "@/state/store";
import { Help } from "@/ui/Help";
import { Segmented } from "@/ui/Segmented";
import { cn } from "@/lib/utils";

const SRC = { phase: MILESTONES.AGS_PhaseLines.features, advance: MILESTONES.AGS_AdvanceLines.features };
const title = (kind: LineKind, p: Record<string, unknown> | null) =>
  kind === "phase" ? `Phase ${p?.line_id} · ${p?.name}` : `${p?.unit} · ${PLAN_MATCH.planned_names[String(p?.unit)] ?? ""}`;
const btn = "flex items-center gap-1 rounded-[var(--radius)] border px-2 py-1 text-[12px] disabled:opacity-40";
const NAMES = TOWNS.flatMap((t) => [t.name, ...(t.aka ?? [])]);

/** The original line as editable points: its listed towns, or else the towns it passes within 12 km of plus its two ends. */
function seed(kind: LineKind, id: string): number[][] {
  const f = SRC[kind].find((x) => lineId(kind, x.properties) === id);
  const listed = parseTowns(String(f?.properties?.towns ?? "")).towns.map((t) => t.ll);
  if (listed.length >= 2) return listed;
  const c = (f?.geometry as LineString | undefined)?.coordinates ?? [];
  const out: number[][] = [];
  for (const v of c) {
    const t = snapTown(v)?.ll ?? (v === c[0] || v === c[c.length - 1] ? v.map((x) => Math.round(x * 100) / 100) : null);
    if (t && out.at(-1) !== t) out.push(t);
  }
  return out;
}

/** Redraw a planned phase line or line of advance: a row of points (towns) you add by name or by clicking the map. */
export function LineEditor() {
  const [kind, setKind] = useState<LineKind>("phase");
  const [id, setId] = useState(lineId("phase", SRC.phase[0].properties));
  const edit = useStore((s) => s.lineEdits[kind][id]);
  const drawing = useStore((s) => s.drawing);
  const isDrawing = drawing?.kind === kind && drawing.id === id;
  const pts = edit ?? seed(kind, id);
  const names = townNames(pts).split(" - ");

  const pick = (k: LineKind, i: string) => { set({ drawing: null }); setKind(k); setId(i); };
  const save = (c: number[][]) => { set({ showPlan: true }); setLine(kind, id, c); };
  const move = (i: number, d: number) => { const c = [...pts]; [c[i], c[i + d]] = [c[i + d], c[i]]; save(c); };
  const draw = () => {
    if (isDrawing) return set({ drawing: null, drawCursor: null });
    if (!edit) setLine(kind, id, pts); // clicks carry on from the points shown
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

      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">
          {kind === "phase" ? "North to south" : "Start to finish"} · {edit ? "redrawn, shown on the map" : "the original line; any change redraws it through these points"}
        </span>
        <ol className="flex flex-wrap items-center gap-1" aria-label="Points of the line">
          {pts.map((p, i) => (
            <li key={`${i}|${p.join()}`} className={cn("flex items-center rounded-full border text-[12px]", edit ? "border-primary/60 bg-primary/10" : "border-border")}>
              <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded-full p-0.5 hover:bg-muted disabled:opacity-25" aria-label={`Move ${names[i]} earlier`}><ChevronLeft size={12} /></button>
              <span className="px-0.5">{names[i]}</span>
              <button onClick={() => move(i, 1)} disabled={i === pts.length - 1} className="rounded-full p-0.5 hover:bg-muted disabled:opacity-25" aria-label={`Move ${names[i]} later`}><ChevronRight size={12} /></button>
              <button onClick={() => save(pts.filter((_, j) => j !== i))} className="rounded-full p-0.5 hover:bg-muted" aria-label={`Remove ${names[i]}`}><X size={12} /></button>
            </li>
          ))}
        </ol>
      </div>
      <AddTowns onAdd={(ll) => save([...pts, ...ll])} />

      <div className="flex flex-wrap gap-1.5">
        <button onClick={draw} aria-pressed={isDrawing} className={cn(btn, isDrawing ? "border-primary bg-primary/15" : "border-border hover:bg-muted")}>
          <Pencil size={13} /> {isDrawing ? "Done drawing" : "Draw on map"}
        </button>
        <button onClick={() => save([])} disabled={!pts.length} className={cn(btn, "border-border hover:bg-muted")}>
          <Eraser size={13} /> Clear
        </button>
        <button onClick={() => { set({ drawing: null }); setLine(kind, id, null); }} disabled={!edit} className={cn(btn, "border-border hover:bg-muted")}>
          <RotateCcw size={13} /> Original
        </button>
      </div>
      {isDrawing && <p className="text-[11px] text-primary">Click a town dot, or anywhere on the map, to add the next point; clicks within 12 km of a town snap to it.</p>}
      {edit && edit.length < 2 && <p className="text-[11px] text-muted-foreground">Add at least two points; until then the original line is used.</p>}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Redrawn lines are used on the map, in Natural breaks, in the phase-line crossings on the Plan tab and in Planned vs actual.
        The Method check, Diversity and the Groups tab stay on the original lines (they are computed offline). Redrawn lines are kept in saved workspaces.
      </p>
    </div>
  );
}

/** Type a town (suggestions as you type) or paste a list ("Kovel - Lutsk - Brody"); Enter adds it to the end of the line. */
function AddTowns({ onAdd }: { onAdd: (ll: number[][]) => void }) {
  const [text, setText] = useState("");
  const { towns, unknown } = parseTowns(text);
  const add = () => {
    if (!towns.length || unknown.length) return;
    onAdd(towns.map((t) => t.ll));
    setText("");
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1.5">
        <input list="line-towns" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a town, e.g. Zhytomyr" aria-label="Add a town to the line"
          className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-1 text-[12px]" />
        <datalist id="line-towns">{NAMES.map((n) => <option key={n} value={n} />)}</datalist>
        <button onClick={add} disabled={!towns.length || unknown.length > 0} className={cn(btn, "shrink-0 border-border hover:bg-muted")}>Add</button>
      </div>
      {unknown.length > 0 && <span className="text-[11px] text-danger">Unknown: {unknown.join(", ")}</span>}
    </div>
  );
}
