import { useMemo } from "react";
import { MILESTONES } from "@/data";
import { crossings } from "@/lib/crossing";
import { fmtShort } from "@/lib/dates";
import { set, useStore } from "@/state/store";
import { cn } from "@/lib/utils";

const ADVANCE: Record<string, string> = { purple: "#8e44ad", blue: "#2e86de", orange: "#e67e22", black: "#9aa0a6" };

/** AGS pre-war milestones against when division points actually crossed each phase line. */
export function PlanVsActual() {
  const page = useStore((s) => s.page);
  const data = useStore((s) => s.data);
  const date = useStore((s) => s.date);
  const showPlan = useStore((s) => s.showPlan);
  const rows = useMemo(
    () => (page === "frontier" ? crossings(MILESTONES.AGS_PhaseLines.features, data.regions.frontier.points.features, date) : []),
    [page, data, date],
  );
  if (page !== "frontier") return <p className="p-4 text-muted-foreground">The AGS milestones cover the Frontier theater.</p>;

  return (
    <div className="flex flex-col gap-3">
      {!showPlan && (
        <button onClick={() => set({ showPlan: true })} className="rounded-[var(--radius)] border border-primary/60 bg-primary/10 px-2 py-1.5 text-[12px]">
          Show the plan layers on the map
        </button>
      )}
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        Phase lines a–e and lines of advance are the historian's pre-war estimates (Sorin's milestones). <b>Lead</b> is the first day any
        division point within a line's latitude band lay beyond it; <b>Main body</b> is the first day at least half did.
      </p>
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => {
          const active = MILESTONES.AGS_PhaseLines.features.find((f) => f.properties?.line_id === r.lineId)?.properties;
          const inWindow = active && date >= active.date_start && date <= active.date_end;
          return (
            <div key={r.lineId} className={cn("frame p-2", inWindow && "ring-1 ring-primary")}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="display text-[15px]"><span className="text-primary">Line {r.lineId.toUpperCase()}</span> · {r.name}</h3>
                {r.delay !== null && (
                  <span className={cn("shrink-0 rounded px-1.5 font-mono text-[11px]", r.delay > 0 ? "bg-danger/20 text-danger" : "bg-ok/20 text-ok")}>
                    {r.delay > 0 ? `+${r.delay}d late` : r.delay < 0 ? `${-r.delay}d early` : "on time"}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">{active?.towns}</div>
              <dl className="mt-1.5 grid grid-cols-3 gap-1 font-mono text-[11px]">
                <Cell label="Planned" value={r.planned} />
                <Cell label="Lead" value={r.lead ? fmtShort(r.lead) : "not reached"} />
                <Cell label="Main body" value={r.main ? fmtShort(r.main) : "not reached"} />
              </dl>
              {r.shareToday !== null && (
                <div className="mt-1.5">
                  <div className="h-1.5 overflow-hidden rounded-sm bg-muted"><div className="h-full bg-primary" style={{ width: `${r.shareToday * 100}%` }} /></div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{Math.round(r.shareToday * 100)}% of units in band beyond the line on {fmtShort(date)}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <section>
        <h3 className="display mb-1 text-[13px] text-muted-foreground">Planned lines of advance</h3>
        {MILESTONES.AGS_AdvanceLines.features.map((f) => (
          <div key={String(f.properties?.unit)} className="flex items-start gap-2 py-0.5 text-[12px]">
            <i className="mt-1.5 h-1 w-5 shrink-0 rounded" style={{ background: ADVANCE[f.properties?.color] }} />
            <span><b>{f.properties?.unit}</b> <span className="text-muted-foreground">{f.properties?.notes}</span></span>
          </div>
        ))}
        <p className="mt-1 text-[11px] text-muted-foreground">Dashed: original "small pocket" COA (11A and 17A jaws at Proskurov/Vinnitsa). 11A advanced from Romania, off the source map.</p>
      </section>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return <div><dt className="display text-[9px] text-muted-foreground">{label}</dt><dd>{value}</dd></div>;
}
