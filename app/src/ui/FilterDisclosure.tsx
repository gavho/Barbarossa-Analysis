// Adapted from watermelon-ui `filter-disclosure`: a funnel button that morphs (shared layoutId) into an option
// list with spring-staggered rows and an animated check. Controlled, inline-sized for the side panel.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { Check, Funnel } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterOption { id: string; label: string; swatch?: string }

const SPRING = { type: "spring", stiffness: 240, damping: 20, mass: 1 } as const;

export function FilterDisclosure({ id, label, options, value, onChange }: {
  id: string;
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.id === value);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={box} className="relative">
      <MotionConfig transition={{ type: "spring", bounce: 0.25, duration: 0.5 }}>
        <AnimatePresence mode="popLayout" initial={false}>
          {open ? (
            <motion.div key="open" layoutId={`filter-${id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0 } }}
              className="absolute left-0 top-0 z-30 flex w-full flex-col gap-0.5 rounded-[var(--radius)] border border-border bg-card p-1 shadow-xl" role="listbox" aria-label={label}>
              <div className="display px-2 pt-1 pb-1.5 text-[11px] text-muted-foreground">{label}</div>
              {options.map((o, i) => {
                const sel = o.id === value;
                return (
                  <motion.button key={o.id} role="option" aria-selected={sel} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING, delay: i * 0.03 }} whileTap={{ scale: 0.98 }}
                    onClick={() => { onChange(o.id); setTimeout(() => setOpen(false), 180); }}
                    className="flex items-center justify-between rounded-[var(--radius)] px-2 py-1.5 hover:bg-accent">
                    <span className="flex items-center gap-2">
                      {o.swatch && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: o.swatch }} />}
                      <span className="text-[13px]">{o.label}</span>
                    </span>
                    <span className={cn("flex h-4 w-4 items-center justify-center rounded-sm border", sel ? "border-primary bg-primary" : "border-border")}>
                      <motion.span animate={{ scale: sel ? 1 : 0, opacity: sel ? 1 : 0 }} transition={{ type: "spring", stiffness: 520, damping: 30 }}>
                        <Check size={11} className="text-primary-foreground" />
                      </motion.span>
                    </span>
                  </motion.button>
                );
              })}
            </motion.div>
          ) : (
            <motion.button key="closed" layoutId={`filter-${id}`} onClick={() => setOpen(true)} whileTap={{ scale: 0.97 }}
              className="flex w-full items-center gap-2 rounded-[var(--radius)] border border-border bg-background px-2 py-1.5 text-left hover:border-primary/60">
              <Funnel size={13} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="display block text-[10px] text-muted-foreground">{label}</span>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span key={value} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                    className="flex items-center gap-1.5 text-[13px]">
                    {current?.swatch && <span className="h-2 w-2 rounded-sm" style={{ background: current.swatch }} />}
                    {current?.label}
                  </motion.span>
                </AnimatePresence>
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </MotionConfig>
    </div>
  );
}
