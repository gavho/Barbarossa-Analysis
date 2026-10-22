// Timeline built on watermelon-ui `scrub-slider`: spring-smoothed thumb, tick rail, floating value bubble,
// pointer scrubbing. Controlled by the store date; adds playback, keyboard stepping and month ticks.
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";
import { ChevronLeft, ChevronRight, Pause, Play, SkipBack } from "lucide-react";
import { set, useStore } from "@/state/store";
import { timeWindow } from "@/config/regions";
import { addDays, daysBetween, fmtDate, fmtShort } from "@/lib/dates";
import { Segmented } from "@/ui/Segmented";
import type { Mode } from "@/config/presets";

const SPRING = { stiffness: 260, damping: 28 };
const PAD = 12;
const SPEEDS = [1, 2, 4, 8];

export function Timeline() {
  const page = useStore((s) => s.page);
  const date = useStore((s) => s.date);
  const mode = useStore((s) => s.mode);
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);
  const { start, end } = timeWindow(page);
  const total = Math.max(1, daysBetween(start, end));
  const index = Math.min(total, Math.max(0, daysBetween(start, date)));

  const rail = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const x = useMotionValue(PAD);
  const smoothX = useSpring(x, SPRING);
  const step = width / total;

  useEffect(() => {
    if (!rail.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width - PAD * 2));
    ro.observe(rail.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { x.set(PAD + index * step); }, [index, step, x]);

  const scrubTo = useCallback((clientX: number) => {
    const r = rail.current?.getBoundingClientRect();
    if (!r || !step) return;
    const i = Math.round(Math.max(0, Math.min(width, clientX - r.left - PAD)) / step);
    set({ date: addDays(start, i), playing: false });
  }, [start, step, width]);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => scrubTo(e.clientX);
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [dragging, scrubTo]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const s = useStore.getState();
      const next = addDays(s.date, 1);
      if (next > timeWindow(s.page).end) set({ playing: false });
      else set({ date: next });
    }, 1000 / speed);
    return () => clearInterval(t);
  }, [playing, speed]);

  const stepBy = (n: number) => {
    const d = addDays(date, n);
    if (d >= start && d <= end) set({ date: d, playing: false });
  };
  const ticks = Array.from({ length: total + 1 }, (_, i) => addDays(start, i));

  return (
    <div className="frame flex items-center gap-3 px-3 py-2">
      <div className="flex shrink-0 flex-col gap-1.5">
        <Segmented<Mode> size="sm" value={mode} onChange={(m) => set({ mode: m })}
          items={[{ value: "instant", label: "Instant", title: "Only units on the selected day" }, { value: "progressive", label: "Progressive", title: "Everything up to the selected day" }]} />
        <div className="flex items-center gap-0.5">
          <IconBtn label="Back to start" onClick={() => set({ date: start, playing: false })}><SkipBack size={14} /></IconBtn>
          <IconBtn label="Previous day" onClick={() => stepBy(-1)}><ChevronLeft size={14} /></IconBtn>
          <IconBtn label={playing ? "Pause" : "Play"} primary onClick={() => set({ playing: !playing, date: date >= end ? start : date })}>
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </IconBtn>
          <IconBtn label="Next day" onClick={() => stepBy(1)}><ChevronRight size={14} /></IconBtn>
          <button className="ml-1 rounded border border-border px-1.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
            title="Playback speed (days per second)" onClick={() => set({ speed: SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] })}>
            {speed}×
          </button>
        </div>
      </div>

      <div className="relative min-w-0 flex-1 select-none pt-6">
        <motion.div style={{ left: smoothX }} className="pointer-events-none absolute top-0 z-20 -translate-x-1/2">
          <motion.div animate={{ y: dragging ? -2 : 0, scale: dragging ? 1.06 : 1 }} transition={SPRING}
            className="whitespace-nowrap rounded-[var(--radius)] bg-primary px-2 py-0.5 font-mono text-[11px] font-semibold text-primary-foreground shadow">
            {fmtDate(date)}
          </motion.div>
        </motion.div>
        <div ref={rail} role="slider" tabIndex={0} aria-label="Date" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index} aria-valuetext={fmtDate(date)}
          onPointerDown={(e) => { setDragging(true); scrubTo(e.clientX); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") stepBy(1);
            else if (e.key === "ArrowLeft") stepBy(-1);
            else if (e.key === "Home") set({ date: start });
            else if (e.key === "End") set({ date: end });
          }}
          className="relative h-11 cursor-pointer touch-none overflow-hidden rounded-[var(--radius)] border border-border bg-background">
          <div className="absolute inset-y-2" style={{ left: PAD, right: PAD }}>
            {ticks.map((d, i) => {
              const month = d.endsWith("-01");
              const week = i % 7 === 0;
              return (
                <div key={d} className={month ? "bg-foreground/60" : week ? "bg-muted-foreground/50" : "bg-muted-foreground/20"}
                  style={{ position: "absolute", left: i * step, width: 1, top: month ? 0 : week ? "25%" : "45%", bottom: month ? 0 : week ? "25%" : "45%" }} />
              );
            })}
            {mode === "progressive" && <div className="absolute inset-y-0 left-0 bg-primary/10" style={{ width: index * step }} />}
          </div>
          <motion.div style={{ left: smoothX }} animate={{ scaleY: dragging ? 1.15 : 1 }} transition={SPRING}
            className="absolute top-1.5 bottom-1.5 w-[3px] -translate-x-1/2 rounded bg-primary" />
        </div>
        <div className="relative mt-0.5 h-3 font-mono text-[10px] text-muted-foreground">
          <span className="absolute left-0">{fmtShort(start)}</span>
          {ticks.map((d, i) => d.endsWith("-01") && i * step > 40 && (total - i) * step > 40 && (
            <span key={d} className="absolute -translate-x-1/2" style={{ left: PAD + i * step }}>{fmtShort(d)}</span>
          ))}
          <span className="absolute right-0">{fmtShort(end)}</span>
        </div>
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, primary, children }: { label: string; onClick: () => void; primary?: boolean; children: React.ReactNode }) {
  return (
    <button aria-label={label} title={label} onClick={onClick}
      className={primary ? "rounded-[var(--radius)] bg-primary p-1.5 text-primary-foreground hover:opacity-90"
        : "rounded-[var(--radius)] p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"}>
      {children}
    </button>
  );
}
