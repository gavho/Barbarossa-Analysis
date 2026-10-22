import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Camera, ChevronLeft, ChevronRight, Pause, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { region, type RegionId } from "@/config/regions";
import { addDays, daysBetween, fmtDate } from "@/lib/dates";
import { mapRef } from "@/map/MapView";
import { get, goTo, set, useStore, type Step } from "@/state/store";

/** Starter story: opening, midpoint and end of the region's window, using the Experience card text. */
export function defaultStory(id: RegionId): Step[] {
  const r = region(id)!;
  const mid = addDays(r.start, Math.floor(daysBetween(r.start, r.end) / 2));
  return [
    { title: r.title, caption: r.text, date: r.start, mode: "instant", view: null },
    { title: "Momentum", caption: "Division positions accumulate: watch where the advance concentrates and where it stalls.", date: mid, mode: "progressive", view: null },
    { title: "Culmination", caption: `By ${fmtDate(r.end)} the operational paths show where the offensive ran out of momentum.`, date: r.end, mode: "progressive", view: null },
  ];
}

let restore: { leftOpen: boolean; rightOpen: boolean } | null = null;

export function startPresenting(id: RegionId) {
  const s = get();
  restore = { leftOpen: s.leftOpen, rightOpen: s.rightOpen };
  if (!s.stories[id]?.length) set({ stories: { ...s.stories, [id]: defaultStory(id) } });
  set({ presenting: { region: id, step: 0 }, leftOpen: false, rightOpen: false });
  document.documentElement.requestFullscreen?.().catch(() => {});
  showStep(id, 0);
}

function stopPresenting() {
  set({ presenting: null, playing: false, ...(restore ?? {}) });
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

function showStep(id: RegionId, i: number) {
  const step = get().stories[id]?.[i];
  if (!step) return;
  if (get().page !== id) goTo(id);
  set({ presenting: { region: id, step: i }, date: step.date, mode: step.mode, playing: false });
  // Wait for the side panels' close animation so the camera fits the final map size.
  setTimeout(() => {
    if (!mapRef) return;
    mapRef.resize();
    if (step.view) mapRef.flyTo({ ...step.view, duration: 1600 });
    else mapRef.fitBounds(region(id)!.bounds, { padding: { top: 30, left: 30, right: 30, bottom: 160 }, duration: 1600 });
  }, 350);
}

export function Presenter() {
  const p = useStore((s) => s.presenting);
  const stories = useStore((s) => s.stories);
  const playing = useStore((s) => s.playing);
  const date = useStore((s) => s.date);
  const [editing, setEditing] = useState(false);
  const steps = p ? stories[p.region] ?? [] : [];
  const step = p ? steps[p.step] : undefined;

  useEffect(() => {
    if (!p) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") showStep(p.region, Math.min(steps.length - 1, p.step + 1));
      else if (e.key === "ArrowLeft" || e.key === "PageUp") showStep(p.region, Math.max(0, p.step - 1));
      else if (e.key === " ") { e.preventDefault(); set({ playing: !get().playing }); }
      else if (e.key === "Escape") stopPresenting();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p, steps.length]);

  // Playing a step runs the timeline until the next step's date, then pauses there.
  useEffect(() => {
    const next = p && steps[p.step + 1];
    if (playing && next && date >= next.date) set({ playing: false });
  }, [date, playing, p, steps]);

  if (!p || !step) return null;
  const patch = (q: Partial<Step>) => set({ stories: { ...stories, [p.region]: steps.map((s, i) => (i === p.step ? { ...s, ...q } : s)) } });
  const capture = () => {
    const s = get();
    patch({ date: s.date, mode: s.mode, view: s.view });
  };
  const add = () => {
    const s = get();
    const n: Step = { title: "New step", caption: "", date: s.date, mode: s.mode, view: s.view };
    set({ stories: { ...stories, [p.region]: [...steps.slice(0, p.step + 1), n, ...steps.slice(p.step + 1)] }, presenting: { ...p, step: p.step + 1 } });
    setEditing(true);
  };
  const remove = () => {
    if (steps.length <= 1) return;
    set({ stories: { ...stories, [p.region]: steps.filter((_, i) => i !== p.step) } });
    showStep(p.region, Math.max(0, p.step - 1));
  };

  return (
    <AnimatePresence>
      <motion.aside key="presenter" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        className="frame scroll-thin pointer-events-auto absolute bottom-3 left-1/2 z-30 max-h-[60%] w-[min(640px,calc(100%-24px))] -translate-x-1/2 overflow-x-hidden overflow-y-auto p-4 shadow-2xl" aria-label="Presentation">
        <div className="mb-1 flex items-center justify-between">
          <span className="display text-[11px] text-primary">{region(p.region)!.title} · Step {p.step + 1} / {steps.length} · {fmtDate(step.date)}</span>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Btn label="Edit step" onClick={() => setEditing(!editing)} on={editing}><Pencil size={14} /></Btn>
            <Btn label="Exit presentation (Esc)" onClick={stopPresenting}><X size={15} /></Btn>
          </div>
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={`${p.step}-${editing}`} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
            {editing ? (
              <div className="flex flex-col gap-1.5">
                <input value={step.title} onChange={(e) => patch({ title: e.target.value })} aria-label="Step title" className="display rounded border border-border bg-background px-2 py-1 text-[18px]" />
                <textarea value={step.caption} onChange={(e) => patch({ caption: e.target.value })} aria-label="Step caption" rows={3} className="rounded border border-border bg-background px-2 py-1" />
                <div className="flex flex-wrap gap-2 text-[12px]">
                  <Pill onClick={capture}><Camera size={12} /> Use current map, date and mode</Pill>
                  <Pill onClick={add}><Plus size={12} /> Add step after</Pill>
                  <Pill onClick={remove}><Trash2 size={12} /> Delete step</Pill>
                </div>
              </div>
            ) : (
              <>
                <h2 className="display text-[24px] leading-tight">{step.title}</h2>
                <p className="mt-1 leading-relaxed text-muted-foreground">{step.caption}</p>
              </>
            )}
          </motion.div>
        </AnimatePresence>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-1">{steps.map((_, i) => <button key={i} aria-label={`Go to step ${i + 1}`} onClick={() => showStep(p.region, i)} className={`h-1.5 w-6 rounded-full ${i === p.step ? "bg-primary" : "bg-muted"}`} />)}</div>
          <div className="flex items-center gap-1">
            <Btn label="Previous step" onClick={() => showStep(p.region, Math.max(0, p.step - 1))}><ChevronLeft size={16} /></Btn>
            <Btn label={playing ? "Pause" : "Play to next step"} onClick={() => set({ playing: !playing })} on={playing}>{playing ? <Pause size={15} /> : <Play size={15} />}</Btn>
            <Btn label="Next step" onClick={() => showStep(p.region, Math.min(steps.length - 1, p.step + 1))}><ChevronRight size={16} /></Btn>
          </div>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}

function Btn({ label, onClick, on, children }: { label: string; onClick: () => void; on?: boolean; children: React.ReactNode }) {
  return <button aria-label={label} title={label} onClick={onClick} className={`rounded-[var(--radius)] p-1.5 hover:bg-muted hover:text-foreground ${on ? "bg-primary/20 text-foreground" : ""}`}>{children}</button>;
}
function Pill({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className="flex items-center gap-1 rounded-[var(--radius)] border border-border px-2 py-1 hover:bg-muted">{children}</button>;
}

