// Adapted from cult-ui `halo-segmented`: same measured sliding thumb and layout spring,
// controlled-only, themed with app tokens (no base-ui, no rainbow glow).
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const layoutSpring = { type: "spring" as const, bounce: 0.12, damping: 34, stiffness: 420 };

export interface SegmentedItem<T extends string> { value: T; label: ReactNode; title?: string }

export function Segmented<T extends string>({ items, value, onChange, className, size = "md" }: {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  const reduce = useReducedMotion() ?? false;
  const track = useRef<HTMLDivElement>(null);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const [thumb, setThumb] = useState({ x: 0, width: 0 });

  const measure = useCallback(() => {
    const t = track.current, a = refs.current.get(value);
    if (!t || !a) return;
    const tr = t.getBoundingClientRect(), br = a.getBoundingClientRect();
    setThumb({ x: br.left - tr.left, width: br.width });
  }, [value]);
  useLayoutEffect(measure, [measure]);
  useLayoutEffect(() => {
    if (!track.current) return;
    const ro = new ResizeObserver(measure);
    ro.observe(track.current);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div ref={track} role="radiogroup" className={cn("relative inline-flex rounded-[var(--radius)] border border-border bg-muted p-0.5", className)}>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-0.5 bottom-0.5 left-0 rounded-[calc(var(--radius)-1px)] border border-primary/60 bg-primary/15"
        animate={{ x: thumb.x, width: thumb.width }}
        initial={false}
        transition={reduce ? { duration: 0 } : layoutSpring}
      />
      {items.map((it) => (
        <button
          key={it.value}
          ref={(el) => { if (el) refs.current.set(it.value, el); else refs.current.delete(it.value); }}
          role="radio"
          aria-checked={it.value === value}
          title={it.title}
          onClick={() => onChange(it.value)}
          className={cn(
            "display relative z-10 flex-1 whitespace-nowrap transition-colors",
            size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs",
            it.value === value ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
